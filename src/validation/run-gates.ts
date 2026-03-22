import type { Database } from "bun:sqlite";
import { join } from "node:path";

import type { YesChefConfig } from "../core/config.ts";
import { runShellCommand, writeProcessOutput } from "../core/exec.ts";
import { resolveRuntimePaths } from "../core/fs.ts";
import { createId } from "../core/ids.ts";
import type { MenuRecord, ValidationRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";

export async function runMenuValidations(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  menu: MenuRecord;
}): Promise<ValidationRecord[]> {
  const results: ValidationRecord[] = [];
  const paths = resolveRuntimePaths(options.root);

  for (const [name, command] of Object.entries(options.config.validations)) {
    const startedAt = new Date().toISOString();
    const validation: ValidationRecord = {
      id: createId("V"),
      menuId: options.menu.id,
      orderId: null,
      runId: null,
      name,
      command,
      status: "running",
      outputPath: null,
      startedAt,
      endedAt: null,
    };

    options.db.query(
      `INSERT INTO validations (id, menu_id, order_id, run_id, name, command, status, output_path, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      validation.id,
      validation.menuId,
      validation.orderId,
      validation.runId,
      validation.name,
      validation.command,
      validation.status,
      validation.outputPath,
      validation.startedAt,
      validation.endedAt,
    );

    await options.bus.emit({
      type: "validation.started",
      menu_id: options.menu.id,
      payload: { validationId: validation.id, name, command },
      role: "expo",
    });

    const result = await runShellCommand(command, { cwd: options.root });
    const outputPath = join(paths.artifactsDir, `${validation.id}-${name}.log`);
    await writeProcessOutput(outputPath, [result.stdout, result.stderr].filter(Boolean).join("\n"));

    const status = result.exitCode === 0 ? "passed" : "failed";
    const endedAt = new Date().toISOString();
    options.db.query(`UPDATE validations SET status = ?, output_path = ?, ended_at = ? WHERE id = ?`).run(
      status,
      outputPath,
      endedAt,
      validation.id,
    );

    await options.bus.emit({
      type: status === "passed" ? "validation.passed" : "validation.failed",
      menu_id: options.menu.id,
      payload: { validationId: validation.id, name, outputPath, exitCode: result.exitCode },
      role: "expo",
    });

    results.push({ ...validation, status, outputPath, endedAt });
  }

  return results;
}
