import { join } from "node:path";

import type { YesChefConfig } from "../../core/config.ts";
import { resolveBackendConfig } from "../../core/config.ts";
import { runProcess, writeProcessOutput } from "../../core/exec.ts";
import { resolveRuntimePaths, writeTextFile } from "../../core/fs.ts";
import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../../core/models.ts";
import type { EventBus } from "../../events/emit.ts";
import { buildCodexPrompt } from "./prompt.ts";
import { normalizeCodexSummary } from "./normalize.ts";

export interface CodexRunResult {
  exitCode: number;
  summary: string;
  stdoutPath: string;
  stderrPath: string;
  command: string;
}

export async function runCodexAdapter(options: {
  root: string;
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  workspace: WorkspaceRecord;
  runId: string;
  bus: EventBus;
}): Promise<CodexRunResult> {
  const backend = resolveBackendConfig(options.config, options.order.backend);
  const prompt = buildCodexPrompt(options.menu, options.order);
  const paths = resolveRuntimePaths(options.root);
  const stdoutPath = join(paths.artifactsDir, `${options.runId}-stdout.log`);
  const stderrPath = join(paths.artifactsDir, `${options.runId}-stderr.log`);
  const promptPath = join(paths.promptsDir, `${options.runId}.md`);

  await writeTextFile(promptPath, prompt);

  const result = await runProcess({
    cmd: [backend.command, ...backend.args],
    cwd: options.workspace.path,
    stdin: prompt,
    onStdoutChunk: async (chunk) => {
      await options.bus.emit({
        type: "run.log",
        menu_id: options.menu.id,
        order_id: options.order.id,
        run_id: options.runId,
        role: options.order.role,
        payload: { stream: "stdout", chunk },
      });
    },
    onStderrChunk: async (chunk) => {
      await options.bus.emit({
        type: "run.log",
        menu_id: options.menu.id,
        order_id: options.order.id,
        run_id: options.runId,
        role: options.order.role,
        payload: { stream: "stderr", chunk },
      });
    },
  });

  await Promise.all([
    writeProcessOutput(stdoutPath, result.stdout),
    writeProcessOutput(stderrPath, result.stderr),
  ]);

  return {
    exitCode: result.exitCode,
    summary: normalizeCodexSummary(result.stdout, result.stderr, result.exitCode),
    stdoutPath,
    stderrPath,
    command: result.command,
  };
}
