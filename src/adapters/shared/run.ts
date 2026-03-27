import { join } from "node:path";

import type { YesChefConfig } from "../../core/config.ts";
import { resolveBackendConfig } from "../../core/config.ts";
import { runProcess, writeProcessOutput } from "../../core/exec.ts";
import { resolveRuntimePaths, writeTextFile } from "../../core/fs.ts";
import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../../core/models.ts";
import type { EventBus } from "../../events/emit.ts";
import type { KnowledgeContext } from "../../knowledge/context.ts";
import { normalizeCodexSummary } from "../codex/normalize.ts";
import { buildCodexPrompt } from "../codex/prompt.ts";

export interface AdapterRunResult {
  exitCode: number;
  summary: string;
  stdoutPath: string;
  stderrPath: string;
  command: string;
}

export async function runCliAdapter(options: {
  adapterName: string;
  root: string;
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  workspace: WorkspaceRecord;
  runId: string;
  bus: EventBus;
  knowledge?: KnowledgeContext;
}): Promise<AdapterRunResult> {
  const backend = resolveBackendConfig(options.config, options.order.backend);
  const prompt = buildCodexPrompt(options.menu, options.order, options.knowledge);
  const paths = resolveRuntimePaths(options.root);
  const stdoutPath = join(paths.artifactsDir, `${options.runId}-stdout.log`);
  const stderrPath = join(paths.artifactsDir, `${options.runId}-stderr.log`);
  const promptPath = join(paths.promptsDir, `${options.runId}.md`);
  const argsTemplate = selectArgsTemplate(backend, options.order.mode);

  if (options.order.mode === "delegate" && !options.order.backendAgent) {
    throw new Error(`Agent ${options.order.agentId} is in delegate mode but does not define backendAgent`);
  }

  const commandArgs = expandCommandArgs(argsTemplate, {
    prompt,
    promptPath,
    model: options.order.model,
    backendAgent: options.order.backendAgent,
    agentId: options.order.agentId,
    mode: options.order.mode,
  });
  const shouldPipePrompt = !argsTemplate.some((arg) => arg.includes("{prompt}") || arg.includes("{prompt_file}"));

  await writeTextFile(promptPath, prompt);

  const result = await runProcess({
    cmd: [backend.command, ...commandArgs],
    cwd: options.workspace.path,
    stdin: shouldPipePrompt ? prompt : undefined,
    onStdoutChunk: async (chunk) => {
      await options.bus.emit({
        type: "run.log",
        menu_id: options.menu.id,
        order_id: options.order.id,
        run_id: options.runId,
        role: options.order.role,
        payload: { stream: "stdout", chunk, adapter: options.adapterName },
      });
    },
    onStderrChunk: async (chunk) => {
      await options.bus.emit({
        type: "run.log",
        menu_id: options.menu.id,
        order_id: options.order.id,
        run_id: options.runId,
        role: options.order.role,
        payload: { stream: "stderr", chunk, adapter: options.adapterName },
      });
    },
  });

  await Promise.all([writeProcessOutput(stdoutPath, result.stdout), writeProcessOutput(stderrPath, result.stderr)]);

  return {
    exitCode: result.exitCode,
    summary: normalizeCodexSummary(result.stdout, result.stderr, result.exitCode),
    stdoutPath,
    stderrPath,
    command: result.command,
  };
}

function expandCommandArgs(
  args: string[],
  values: { prompt: string; promptPath: string; model: string; backendAgent: string | null; agentId: string; mode: string },
): string[] {
  return args
    .map((arg) =>
      arg
        .replaceAll("{prompt}", values.prompt)
        .replaceAll("{prompt_file}", values.promptPath)
        .replaceAll("{model}", values.model)
        .replaceAll("{backend_agent}", values.backendAgent ?? "")
        .replaceAll("{agent}", values.agentId)
        .replaceAll("{mode}", values.mode),
    )
    .filter((arg) => arg.length > 0);
}

function selectArgsTemplate(backend: { args: string[]; managedArgs?: string[]; delegateArgs?: string[] }, mode: string): string[] {
  if (mode === "delegate") {
    return backend.delegateArgs ?? backend.args;
  }

  return backend.managedArgs ?? backend.args;
}
