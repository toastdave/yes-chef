import type { Database } from "bun:sqlite";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { resolveAgentForRole } from "../core/agents.ts";
import type { YesChefConfig } from "../core/config.ts";
import { runShellCommand, writeProcessOutput } from "../core/exec.ts";
import { resolveRuntimePaths, writeJsonFile } from "../core/fs.ts";
import { createId } from "../core/ids.ts";
import type {
  ValidationArtifactRecord,
  ValidationArtifactType,
  ValidationRecord,
  ValidationSummary,
  MenuRecord,
} from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";

interface HarnessSummary {
  findings: string[];
  notes: string[];
}

export async function runMenuValidations(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  menu: MenuRecord;
  extraValidations?: Record<string, string>;
  validationPackMap?: Record<string, string[]>;
}): Promise<ValidationRecord[]> {
  const results: ValidationRecord[] = [];
  const paths = resolveRuntimePaths(options.root);
  const expoAgent = resolveAgentForRole(options.config, "expo");
  const validations = {
    ...options.config.validations,
    ...(options.extraValidations ?? {}),
  };

  for (const [name, command] of Object.entries(validations)) {
    const startedAt = new Date().toISOString();
    const packs = options.validationPackMap?.[name] ?? [];
    const validation: ValidationRecord = {
      id: createId("V"),
      menuId: options.menu.id,
      orderId: null,
      runId: null,
      name,
      command,
      status: "running",
      outputPath: null,
      artifacts: [],
      summary: null,
      startedAt,
      endedAt: null,
    };
    const validationDir = join(paths.artifactsDir, "validations", sanitizePathSegment(name), validation.id);
    const outputPath = join(validationDir, "output.log");
    const summaryPath = join(validationDir, "summary.json");

    options.db.query(
      `INSERT INTO validations (id, menu_id, order_id, run_id, name, command, status, output_path, artifacts_json, summary_json, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      validation.id,
      validation.menuId,
      validation.orderId,
      validation.runId,
      validation.name,
      validation.command,
      validation.status,
      validation.outputPath,
      JSON.stringify(validation.artifacts),
      validation.summary ? JSON.stringify(validation.summary) : null,
      validation.startedAt,
      validation.endedAt,
    );

    await mkdir(validationDir, { recursive: true });

    await options.bus.emit({
      type: "validation.started",
      menu_id: options.menu.id,
      payload: {
        validationId: validation.id,
        name,
        command,
        agentId: expoAgent.id,
        packs,
        artifactDir: validationDir,
      },
      role: "expo",
    });

    const result = await runShellCommand(command, {
      cwd: options.root,
      env: {
        YESCHEF_VALIDATION_ID: validation.id,
        YESCHEF_VALIDATION_NAME: name,
        YESCHEF_VALIDATION_ARTIFACT_DIR: validationDir,
        YESCHEF_VALIDATION_OUTPUT_PATH: outputPath,
        YESCHEF_VALIDATION_SUMMARY_PATH: summaryPath,
      },
    });

    await writeProcessOutput(outputPath, [result.stdout, result.stderr].filter(Boolean).join("\n"));

    const harnessSummary = await readHarnessSummary(summaryPath);
    const discoveredArtifacts = await collectValidationArtifacts(validationDir, new Set([outputPath, summaryPath]));
    const summary = buildValidationSummary({
      exitCode: result.exitCode,
      stderr: result.stderr,
      packs,
      artifacts: discoveredArtifacts,
      harnessSummary,
    });

    await writeJsonFile(summaryPath, summary);

    const artifacts: ValidationArtifactRecord[] = [
      { type: "validation_output", path: outputPath, label: "output" },
      ...discoveredArtifacts,
      { type: "summary", path: summaryPath, label: "summary" },
    ];

    const status = summary.failureCategory === "none" ? "passed" : "failed";
    const endedAt = new Date().toISOString();
    options.db.query(
      `UPDATE validations SET status = ?, output_path = ?, artifacts_json = ?, summary_json = ?, ended_at = ? WHERE id = ?`,
    ).run(
      status,
      outputPath,
      JSON.stringify(artifacts),
      JSON.stringify(summary),
      endedAt,
      validation.id,
    );

    for (const artifact of artifacts) {
      await options.bus.emit({
        type: "artifact.created",
        menu_id: options.menu.id,
        role: "expo",
        payload: {
          validationId: validation.id,
          name,
          path: artifact.path,
          type: artifact.type,
          label: artifact.label,
        },
      });
    }

    await options.bus.emit({
      type: status === "passed" ? "validation.passed" : "validation.failed",
      menu_id: options.menu.id,
      payload: {
        validationId: validation.id,
        name,
        outputPath,
        exitCode: result.exitCode,
        agentId: expoAgent.id,
        packs,
        artifacts,
        summary,
      },
      role: "expo",
    });

    results.push({ ...validation, status, outputPath, artifacts, summary, endedAt });
  }

  return results;
}

async function readHarnessSummary(summaryPath: string): Promise<HarnessSummary> {
  try {
    const raw = await readFile(summaryPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      findings: normalizeStringArray(parsed.findings),
      notes: normalizeStringArray(parsed.notes),
    };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";
    if (code === "ENOENT") {
      return { findings: [], notes: [] };
    }

    return {
      findings: [],
      notes: ["Harness summary was not valid JSON and was replaced by Yes Chef."],
    };
  }
}

async function collectValidationArtifacts(
  artifactDir: string,
  excludedPaths: Set<string>,
): Promise<ValidationArtifactRecord[]> {
  const files = await walkFiles(artifactDir);

  return files
    .filter((filePath) => !excludedPaths.has(filePath))
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({
      type: classifyValidationArtifact(filePath),
      path: filePath,
      label: basename(filePath),
    }));
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function classifyValidationArtifact(filePath: string): ValidationArtifactType {
  const fileName = basename(filePath).toLowerCase();
  const extension = extname(fileName);

  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension) || /(screen|snapshot|image)/.test(fileName)) {
    return "screenshot";
  }

  if ([".trace", ".har", ".zip"].includes(extension) || /(trace|playwright|har)/.test(fileName)) {
    return "trace";
  }

  return "validation_output";
}

function buildValidationSummary(options: {
  exitCode: number;
  stderr: string;
  packs: string[];
  artifacts: ValidationArtifactRecord[];
  harnessSummary: HarnessSummary;
}): ValidationSummary {
  const screenshotCount = options.artifacts.filter((artifact) => artifact.type === "screenshot").length;
  const traceCount = options.artifacts.filter((artifact) => artifact.type === "trace").length;
  const browserValidation = options.packs.includes("browser");
  const hasBrowserEvidence = screenshotCount > 0 || traceCount > 0;

  let failureCategory: ValidationSummary["failureCategory"] = "none";
  const findings = [...options.harnessSummary.findings];
  const notes = [...options.harnessSummary.notes];

  if (options.exitCode !== 0 && /(command not found|no such file|enoent|not found)/i.test(options.stderr)) {
    failureCategory = "harness-error";
    findings.push("Validation command failed before app-level verification completed.");
  } else if (options.exitCode !== 0) {
    failureCategory = "app-regression";
    findings.push("Validation command reported a failing result.");
  } else if (browserValidation && !hasBrowserEvidence) {
    failureCategory = "missing-browser-artifacts";
    findings.push("Browser validation did not produce a screenshot or trace artifact.");
  }

  if (browserValidation) {
    notes.push(`Browser evidence: ${screenshotCount} screenshot(s), ${traceCount} trace artifact(s).`);
  }

  return {
    exitCode: options.exitCode,
    failureCategory,
    packs: options.packs,
    artifactCount: options.artifacts.length + 2,
    screenshotCount,
    traceCount,
    findings,
    notes,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function sanitizePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "validation";
}
