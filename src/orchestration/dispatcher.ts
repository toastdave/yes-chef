import type { Database } from "bun:sqlite";

import { runClaudeAdapter } from "../adapters/claude/run.ts";
import { runCodexAdapter } from "../adapters/codex/run.ts";
import { runGeminiAdapter } from "../adapters/gemini/run.ts";
import { runOpenCodeAdapter } from "../adapters/opencode/run.ts";
import type { AdapterRunResult } from "../adapters/shared/run.ts";
import type { YesChefConfig } from "../core/config.ts";
import { createId } from "../core/ids.ts";
import type { ArtifactRecord, MenuRecord, OrderRecord, RunRecord, WorkspaceRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";
import { scheduleRepairOrder } from "./retry.ts";
import { attachWorkspaceToOrder, updateOrderStatus } from "./orders.ts";
import { ensureWorkspace } from "../workspaces/create.ts";
import { releaseWorkspace } from "../workspaces/cleanup.ts";

export async function dispatchOrder(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  menu: MenuRecord;
  order: OrderRecord;
}): Promise<RunRecord> {
  const workspace = await ensureWorkspace(options.db, options.root, options.config, options.order);
  attachWorkspaceToOrder(options.db, options.order.id, workspace.id);

  await options.bus.emit({
    type: "workspace.created",
    menu_id: options.menu.id,
    order_id: options.order.id,
    role: options.order.role,
    payload: {
      workspaceId: workspace.id,
      path: workspace.path,
      isolated: workspace.strategy === "worktree",
      strategy: workspace.strategy,
      reason: workspace.isolationReason,
      baseRevision: workspace.baseRevision,
    },
  });

  options.db.query(`UPDATE workspaces SET locked = 1, status = ?, updated_at = ? WHERE id = ?`).run(
    "locked",
    new Date().toISOString(),
    workspace.id,
  );

  await options.bus.emit({
    type: "workspace.locked",
    menu_id: options.menu.id,
    order_id: options.order.id,
    role: options.order.role,
    payload: { workspaceId: workspace.id },
  });

  updateOrderStatus(options.db, options.order.id, "running");

  const now = new Date().toISOString();
  const runId = createId("R");
  const run: RunRecord = {
    id: runId,
    orderId: options.order.id,
    role: options.order.role,
    agentId: options.order.agentId,
    backend: options.order.backend,
    model: options.order.model,
    mode: options.order.mode,
    backendAgent: options.order.backendAgent,
    command: "",
    status: "running",
    startedAt: now,
    endedAt: null,
    exitCode: null,
    summary: null,
    artifactIds: [],
    createdAt: now,
    updatedAt: now,
  };

  options.db.query(
    `INSERT INTO runs (
      id, order_id, role, agent_id, backend, model, mode, backend_agent, command, status, started_at,
      ended_at, exit_code, summary, artifact_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.orderId,
    run.role,
    run.agentId,
    run.backend,
    run.model,
    run.mode,
    run.backendAgent,
    run.command,
    run.status,
    run.startedAt,
    run.endedAt,
    run.exitCode,
    run.summary,
    JSON.stringify(run.artifactIds),
    run.createdAt,
    run.updatedAt,
  );

  await options.bus.emit({
    type: "run.started",
    menu_id: options.menu.id,
    order_id: options.order.id,
    run_id: run.id,
    role: options.order.role,
    payload: {
      backend: options.order.backend,
      agentId: options.order.agentId,
      model: options.order.model,
      mode: options.order.mode,
      backendAgent: options.order.backendAgent,
    },
  });

  const adapterResult = await dispatchToBackend({
    root: options.root,
    config: options.config,
    menu: options.menu,
    order: options.order,
    workspace,
    runId,
    bus: options.bus,
  });

  const artifacts = [
    createArtifactRecord(run.id, "stdout_log", adapterResult.stdoutPath),
    createArtifactRecord(run.id, "stderr_log", adapterResult.stderrPath),
  ];

  for (const artifact of artifacts) {
    options.db.query(`INSERT INTO artifacts (id, run_id, type, path, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      artifact.id,
      artifact.runId,
      artifact.type,
      artifact.path,
      artifact.metadataJson,
      artifact.createdAt,
    );

    await options.bus.emit({
      type: "artifact.created",
      menu_id: options.menu.id,
      order_id: options.order.id,
      run_id: run.id,
      role: options.order.role,
      payload: { artifactId: artifact.id, path: artifact.path, type: artifact.type },
    });
  }

  const finishedStatus = adapterResult.exitCode === 0 ? "completed" : "failed";
  const finishedAt = new Date().toISOString();
  options.db.query(
    `UPDATE runs SET command = ?, status = ?, ended_at = ?, exit_code = ?, summary = ?, artifact_ids_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    adapterResult.command,
    finishedStatus,
    finishedAt,
    adapterResult.exitCode,
    adapterResult.summary,
    JSON.stringify(artifacts.map((artifact) => artifact.id)),
    finishedAt,
    run.id,
  );

  updateOrderStatus(options.db, options.order.id, finishedStatus === "completed" ? "completed" : "failed");

  if (finishedStatus === "failed" && options.order.kind !== "review") {
    await scheduleRepairOrder({
      db: options.db,
      root: options.root,
      config: options.config,
      bus: options.bus,
      failedOrder: options.order,
      failedRun: {
        ...run,
        command: adapterResult.command,
        status: finishedStatus,
        endedAt: finishedAt,
        exitCode: adapterResult.exitCode,
        summary: adapterResult.summary,
        artifactIds: artifacts.map((artifact) => artifact.id),
        updatedAt: finishedAt,
      },
      workspace,
      stdoutPath: adapterResult.stdoutPath,
      stderrPath: adapterResult.stderrPath,
    });
  }

  await releaseWorkspace(options.db, options.root, options.config, workspace, finishedStatus === "failed");

  await options.bus.emit({
    type: adapterResult.exitCode === 0 ? "run.completed" : "run.failed",
    menu_id: options.menu.id,
    order_id: options.order.id,
    run_id: run.id,
    role: options.order.role,
    payload: { exitCode: adapterResult.exitCode, summary: adapterResult.summary },
  });

  return {
    ...run,
    command: adapterResult.command,
    status: finishedStatus,
    endedAt: finishedAt,
    exitCode: adapterResult.exitCode,
    summary: adapterResult.summary,
    artifactIds: artifacts.map((artifact) => artifact.id),
    updatedAt: finishedAt,
  };
}

async function dispatchToBackend(options: {
  root: string;
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  workspace: WorkspaceRecord;
  runId: string;
  bus: EventBus;
}): Promise<AdapterRunResult> {
  switch (options.order.backend) {
    case "codex":
      return runCodexAdapter(options);
    case "opencode":
      return runOpenCodeAdapter(options);
    case "claude":
      return runClaudeAdapter(options);
    case "gemini":
      return runGeminiAdapter(options);
    default:
      return runOpenCodeAdapter(options);
  }
}

function createArtifactRecord(runId: string, type: ArtifactRecord["type"], path: string): ArtifactRecord {
  return {
    id: createId("A"),
    runId,
    type,
    path,
    metadataJson: JSON.stringify({ path }),
    createdAt: new Date().toISOString(),
  };
}
