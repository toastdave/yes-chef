import type { Database } from "bun:sqlite";
import { join } from "node:path";

import { appendOrderToMenu } from "./menu.ts";
import { insertOrder, listOrdersByMenu } from "./orders.ts";
import type { YesChefConfig } from "../core/config.ts";
import { runShellCommand } from "../core/exec.ts";
import { writeJsonFile } from "../core/fs.ts";
import { createId } from "../core/ids.ts";
import type { OrderRecord, RunRecord, WorkspaceRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";

export async function scheduleRepairOrder(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  failedOrder: OrderRecord;
  failedRun: RunRecord;
  workspace: WorkspaceRecord;
  stdoutPath: string;
  stderrPath: string;
}): Promise<OrderRecord | null> {
  const latestOrders = listOrdersByMenu(options.db, options.failedOrder.menuId);
  const existingRepair = latestOrders.find(
    (order) =>
      order.repairForOrderId === options.failedOrder.id &&
      (order.status === "pending" || order.status === "queued" || order.status === "running" || order.status === "completed"),
  );

  if (existingRepair) {
    return null;
  }

  if (options.failedOrder.retryCount >= options.failedOrder.retryLimit) {
    await options.bus.emit({
      type: "order.blocked",
      menu_id: options.failedOrder.menuId,
      order_id: options.failedOrder.id,
      role: options.failedOrder.role,
      payload: { reason: "retry limit reached", retryCount: options.failedOrder.retryCount, retryLimit: options.failedOrder.retryLimit },
    });
    return null;
  }

  const context = await buildFailureContext(options);
  const now = new Date().toISOString();
  const order: OrderRecord = {
    ...options.failedOrder,
    id: createId("O"),
    title: `Repair ${options.failedOrder.title}`,
    kind: "repair",
    repairForOrderId: options.failedOrder.id,
    sourceRunId: options.failedRun.id,
    retryCount: options.failedOrder.retryCount + 1,
    failureContext: context,
    isolationStrategy: "worktree",
    isolationReason: "repair order replays failure in isolated workspace",
    workspaceId: null,
    dependsOn: [...options.failedOrder.dependsOn],
    skills: [...options.failedOrder.skills, "repair"],
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  insertOrder(options.db, order);
  appendOrderToMenu(options.db, order.menuId, order.id);

  await options.bus.emit({
    type: "order.created",
    menu_id: order.menuId,
    order_id: order.id,
    role: order.role,
    payload: { title: order.title, kind: order.kind, agentId: order.agentId, repairForOrderId: order.repairForOrderId },
  });

  await options.bus.emit({
    type: "order.queued",
    menu_id: order.menuId,
    order_id: order.id,
    role: order.role,
    payload: { backend: order.backend, model: order.model, retryCount: order.retryCount },
  });

  await options.bus.emit({
    type: "retry.scheduled",
    menu_id: order.menuId,
    order_id: order.id,
    run_id: options.failedRun.id,
    role: order.role,
    payload: {
      repairForOrderId: options.failedOrder.id,
      sourceRunId: options.failedRun.id,
      retryCount: order.retryCount,
      contextPath: context.contextPath,
    },
  });

  return order;
}

async function buildFailureContext(options: {
  root: string;
  failedOrder: OrderRecord;
  failedRun: RunRecord;
  workspace: WorkspaceRecord;
  stdoutPath: string;
  stderrPath: string;
}): Promise<Record<string, unknown>> {
  const gitStatus = await runShellCommand("git status --short", { cwd: options.workspace.path });
  const changedFiles = await runShellCommand("git diff --name-only", { cwd: options.workspace.path });
  const contextPath = join(options.root, ".yeschef", "artifacts", `${options.failedRun.id}-repair-context.json`);
  const context = {
    repairForOrderId: options.failedOrder.id,
    sourceRunId: options.failedRun.id,
    summary: options.failedRun.summary,
    exitCode: options.failedRun.exitCode,
    stdoutPath: options.stdoutPath,
    stderrPath: options.stderrPath,
    changedFiles: changedFiles.stdout.split(/\r?\n/).filter(Boolean),
    gitStatus: gitStatus.stdout.split(/\r?\n/).filter(Boolean),
    acceptanceCriteria: {
      promptTemplate: options.failedOrder.promptTemplate,
      validationsRequired: options.failedOrder.validationsRequired,
      tools: options.failedOrder.tools,
      permissions: options.failedOrder.permissions,
    },
    workspace: {
      path: options.workspace.path,
      strategy: options.workspace.strategy,
      baseRevision: options.workspace.baseRevision,
      branchName: options.workspace.branchName,
    },
    contextPath,
  };

  await writeJsonFile(contextPath, context);
  return context;
}
