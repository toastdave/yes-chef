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
  repairTargetOrder?: OrderRecord;
  reason?: string;
}): Promise<OrderRecord | null> {
  const repairTarget = options.repairTargetOrder ?? options.failedOrder;
  const latestOrders = listOrdersByMenu(options.db, repairTarget.menuId);
  const existingRepair = latestOrders.find(
    (order) =>
      order.repairForOrderId === repairTarget.id &&
      (order.status === "pending" || order.status === "queued" || order.status === "running" || order.status === "completed"),
  );

  if (existingRepair) {
    return null;
  }

  if (repairTarget.retryCount >= repairTarget.retryLimit) {
    await options.bus.emit({
      type: "order.blocked",
      menu_id: repairTarget.menuId,
      order_id: repairTarget.id,
      role: repairTarget.role,
      payload: {
        reason: options.reason ?? "retry limit reached",
        retryCount: repairTarget.retryCount,
        retryLimit: repairTarget.retryLimit,
        triggerOrderId: options.failedOrder.id,
      },
    });
    return null;
  }

  const context = await buildFailureContext({
    root: options.root,
    failedOrder: options.failedOrder,
    failedRun: options.failedRun,
    workspace: options.workspace,
    stdoutPath: options.stdoutPath,
    stderrPath: options.stderrPath,
    repairTargetOrder: repairTarget,
  });
  const now = new Date().toISOString();
  const order: OrderRecord = {
    ...repairTarget,
    id: createId("O"),
    title: options.failedOrder.kind === "review" ? `Repair ${repairTarget.title} after review` : `Repair ${repairTarget.title}`,
    kind: "repair",
    repairForOrderId: repairTarget.id,
    sourceRunId: options.failedRun.id,
    retryCount: repairTarget.retryCount + 1,
    failureContext: context,
    isolationStrategy: "worktree",
    isolationReason: options.reason ?? "repair order replays failure in isolated workspace",
    workspaceId: null,
    dependsOn: [...repairTarget.dependsOn],
    skills: [...repairTarget.skills, options.failedOrder.kind === "review" ? "review-repair" : "repair"],
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
      payload: {
        title: order.title,
        kind: order.kind,
        agentId: order.agentId,
        repairForOrderId: order.repairForOrderId,
        triggerOrderId: options.failedOrder.id,
      },
    });

  await options.bus.emit({
    type: "order.queued",
    menu_id: order.menuId,
    order_id: order.id,
      role: order.role,
      payload: { backend: order.backend, model: order.model, retryCount: order.retryCount, triggerOrderKind: options.failedOrder.kind },
    });

  await options.bus.emit({
    type: "retry.scheduled",
    menu_id: order.menuId,
    order_id: order.id,
    run_id: options.failedRun.id,
    role: order.role,
      payload: {
        repairForOrderId: repairTarget.id,
        sourceRunId: options.failedRun.id,
        retryCount: order.retryCount,
        contextPath: context.contextPath,
        triggerOrderId: options.failedOrder.id,
        triggerOrderKind: options.failedOrder.kind,
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
  repairTargetOrder: OrderRecord;
}): Promise<Record<string, unknown>> {
  const gitStatus = await runShellCommand("git status --short", { cwd: options.workspace.path });
  const changedFiles = await runShellCommand("git diff --name-only", { cwd: options.workspace.path });
  const contextPath = join(options.root, ".yeschef", "artifacts", `${options.failedRun.id}-repair-context.json`);
  const context = {
    repairForOrderId: options.repairTargetOrder.id,
    triggerOrderId: options.failedOrder.id,
    triggerOrderKind: options.failedOrder.kind,
    sourceRunId: options.failedRun.id,
    summary: options.failedRun.summary,
    exitCode: options.failedRun.exitCode,
    stdoutPath: options.stdoutPath,
    stderrPath: options.stderrPath,
    changedFiles: changedFiles.stdout.split(/\r?\n/).filter(Boolean),
    gitStatus: gitStatus.stdout.split(/\r?\n/).filter(Boolean),
    acceptanceCriteria: {
      promptTemplate: options.repairTargetOrder.promptTemplate,
      validationsRequired: options.repairTargetOrder.validationsRequired,
      tools: options.repairTargetOrder.tools,
      permissions: options.repairTargetOrder.permissions,
    },
    repairTarget: {
      orderId: options.repairTargetOrder.id,
      title: options.repairTargetOrder.title,
      role: options.repairTargetOrder.role,
      agentId: options.repairTargetOrder.agentId,
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
