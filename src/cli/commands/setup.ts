import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { listBackendAvailability, recommendedModelForBackend } from "../../core/backends.ts";
import { loadConfig, loadConfigFile, globalConfigPath, stringifyConfig, type YesChefConfig } from "../../core/config.ts";
import { ensureParentDirectory } from "../../core/fs.ts";
import { runShellCommand } from "../../core/exec.ts";

export async function runSetupCommand(args: string[]): Promise<void> {
  const defaultsOnly = args.includes("--defaults");
  const globalPath = globalConfigPath();
  const effectiveConfig = await loadConfig();
  const existingGlobal = (await loadConfigFile(globalPath)) ?? {};
  let availability = listBackendAvailability(effectiveConfig);
  let selectedBackends = availability.filter((backend) => backend.installed).map((backend) => backend.id);

  if (!defaultsOnly && process.stdin.isTTY && process.stdout.isTTY) {
    const io = createInterface({ input: process.stdin, output: process.stdout });

    try {
      if (selectedBackends.length === 0) {
        console.log("No supported coding CLIs found. Yes Chef recommends installing opencode first.");
        const install = await io.question("Install opencode now? [Y/n] ");

        if (isAffirmative(install)) {
          await installOpenCode(effectiveConfig);
          availability = listBackendAvailability(effectiveConfig);
          selectedBackends = availability.filter((backend) => backend.installed).map((backend) => backend.id);
        }
      }

      const detected = selectedBackends.join(", ") || "none";
      const selectedAnswer = await io.question(
        `Enabled backends (comma-separated, blank for detected: ${detected || "none"}) `,
      );

      if (selectedAnswer.trim()) {
        selectedBackends = normalizeBackendSelection(selectedAnswer, availability.map((backend) => backend.id));
      }

      if (selectedBackends.length === 0) {
        selectedBackends = ["opencode"];
      }

      const suggestedBackend = selectedBackends[0];
      const defaultBackendAnswer = await io.question(`Default backend [${suggestedBackend}] `);
      const defaultBackend = normalizeSingleChoice(defaultBackendAnswer, suggestedBackend, availability.map((backend) => backend.id));
      if (!selectedBackends.includes(defaultBackend)) {
        selectedBackends.push(defaultBackend);
      }

      const suggestedModel = recommendedModelForBackend(defaultBackend);
      const defaultModelAnswer = await io.question(`Default model [${suggestedModel}] `);
      const defaultModel = defaultModelAnswer.trim() || suggestedModel;

      await writeGlobalSetupConfig({
        existingGlobal,
        effectiveConfig,
        globalPath,
        selectedBackends,
        defaultBackend,
        defaultModel,
      });
    } finally {
      io.close();
    }

    return;
  }

  if (selectedBackends.length === 0) {
    console.log("No supported coding CLIs found. Writing an opencode-first global config.");
    selectedBackends = ["opencode"];
  }

  const defaultBackend = selectedBackends[0];
  const defaultModel = recommendedModelForBackend(defaultBackend);
  await writeGlobalSetupConfig({
    existingGlobal,
    effectiveConfig,
    globalPath,
    selectedBackends,
    defaultBackend,
    defaultModel,
  });
}

async function writeGlobalSetupConfig(options: {
  existingGlobal: Partial<YesChefConfig>;
  effectiveConfig: YesChefConfig;
  globalPath: string;
  selectedBackends: string[];
  defaultBackend: string;
  defaultModel: string;
}): Promise<void> {
  const updated = mergeObjects(options.existingGlobal, {
    $schema: options.effectiveConfig.$schema,
    defaults: {
      ...options.existingGlobal.defaults,
      backend: options.defaultBackend,
      model: options.defaultModel,
      agent: options.existingGlobal.defaults?.agent ?? options.effectiveConfig.defaults.agent,
      mode: options.existingGlobal.defaults?.mode ?? options.effectiveConfig.defaults.mode,
      profile: options.existingGlobal.defaults?.profile ?? options.effectiveConfig.defaults.profile,
    },
    backends: Object.fromEntries(
      Object.entries(options.effectiveConfig.backends).map(([id, backend]) => [
        id,
        {
          ...(options.existingGlobal.backends?.[id] ?? {}),
          ...backend,
          enabled: options.selectedBackends.includes(id),
        },
      ]),
    ),
  });

  await ensureParentDirectory(options.globalPath);
  await writeFile(options.globalPath, stringifyConfig(updated), "utf8");

  console.log(`Wrote global config to ${options.globalPath}`);
  console.log(`Enabled backends: ${options.selectedBackends.join(", ")}`);
  console.log(`Default agent backend/model: ${options.defaultBackend} / ${options.defaultModel}`);
  console.log("Built-in Yes Chef agents will inherit these defaults unless overridden.");
}

async function installOpenCode(config: YesChefConfig): Promise<void> {
  const installHint = config.backends.opencode?.installHint;

  if (!installHint) {
    console.log("No install hint configured for opencode.");
    return;
  }

  console.log(`Running: ${installHint}`);
  const result = await runShellCommand(installHint, { cwd: process.cwd() });

  if (result.exitCode !== 0) {
    console.log("OpenCode install failed. You can install it manually and rerun `yeschef setup`.");
    if (result.stderr.trim()) {
      console.log(result.stderr.trim());
    }
  }
}

function normalizeBackendSelection(value: string, allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && allowedSet.has(item));
}

function normalizeSingleChoice(value: string, fallback: string, allowed: string[]): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return allowed.includes(trimmed) ? trimmed : fallback;
}

function isAffirmative(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}

function mergeObjects<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const result = structuredClone(base) as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = mergeObjects(current, value);
      continue;
    }

    result[key] = value;
  }

  return result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
