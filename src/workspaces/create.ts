import type { Database } from "bun:sqlite";
import { join } from "node:path";

import type { YesChefConfig } from "../core/config.ts";
import { runShellCommand } from "../core/exec.ts";
import { createId } from "../core/ids.ts";
import type { OrderRecord, WorkspaceRecord } from "../core/models.ts";
import { ensureRuntimePaths } from "../core/fs.ts";

interface WorkspaceRow {
  id: string;
  order_id: string;
  path: string;
  branch_name: string;
  base_branch: string;
  base_revision: string;
  strategy: WorkspaceRecord["strategy"];
  cleanup_status: WorkspaceRecord["cleanupStatus"];
  isolation_reason: string;
  locked: number;
  status: WorkspaceRecord["status"];
  created_at: string;
  updated_at: string;
}

export interface WorkspacePlan {
  strategy: WorkspaceRecord["strategy"];
  reason: string;
}

const writeKinds = new Set<OrderRecord["kind"]>(["implement", "repair", "rules-update", "merge"]);

export async function ensureWorkspace(
  db: Database,
  root: string,
  config: YesChefConfig,
  order: OrderRecord,
): Promise<WorkspaceRecord> {
  const existing = db.query(`SELECT * FROM workspaces WHERE order_id = ?`).get(order.id) as WorkspaceRow | null;

  if (existing) {
    return mapWorkspaceRow(existing);
  }

  const now = new Date().toISOString();
  const plan = resolveWorkspacePlan(config, order);
  const baseRevision = await resolveBaseRevision(root, config.project.baseBranch);
  const currentBranch = await resolveCurrentBranch(root);
  const workspaceId = createId("W");

  const workspace: WorkspaceRecord =
    plan.strategy === "worktree"
      ? await createDetachedWorktree({
          db,
          root,
          workspaceId,
          order,
          baseBranch: config.project.baseBranch,
          baseRevision,
          createdAt: now,
          reason: plan.reason,
        })
      : {
          id: workspaceId,
          orderId: order.id,
          path: root,
          branchName: currentBranch,
          baseBranch: config.project.baseBranch,
          baseRevision,
          strategy: "in-place",
          cleanupStatus: "kept",
          isolationReason: plan.reason,
          locked: false,
          status: "attached",
          createdAt: now,
          updatedAt: now,
        };

  db.query(
    `INSERT INTO workspaces (
      id, order_id, path, branch_name, base_branch, base_revision, strategy, cleanup_status,
      isolation_reason, locked, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    workspace.id,
    workspace.orderId,
    workspace.path,
    workspace.branchName,
    workspace.baseBranch,
    workspace.baseRevision,
    workspace.strategy,
    workspace.cleanupStatus,
    workspace.isolationReason,
    workspace.locked ? 1 : 0,
    workspace.status,
    workspace.createdAt,
    workspace.updatedAt,
  );

  return workspace;
}

export function resolveWorkspacePlan(config: YesChefConfig, order: OrderRecord): WorkspacePlan {
  const mode = config.policies.worktrees.mode;

  if (mode === "off") {
    return { strategy: "in-place", reason: "policy disables worktree isolation" };
  }

  if (mode === "required") {
    return { strategy: "worktree", reason: "policy requires isolated worktrees" };
  }

  if (order.kind === "repair") {
    return { strategy: "worktree", reason: "repair orders require isolated replay context" };
  }

  if (writeKinds.has(order.kind)) {
    return { strategy: "worktree", reason: "write-capable orders use isolated worktrees by default" };
  }

  return { strategy: "in-place", reason: "read-only order can use in-place workspace" };
}

async function createDetachedWorktree(options: {
  db: Database;
  root: string;
  workspaceId: string;
  order: OrderRecord;
  baseBranch: string;
  baseRevision: string;
  createdAt: string;
  reason: string;
}): Promise<WorkspaceRecord> {
  const runtimePaths = await ensureRuntimePaths(options.root);
  const workspacePath = join(runtimePaths.workspacesDir, options.workspaceId);
  const branchName = `yeschef/${sanitizeRef(options.order.id)}-${options.workspaceId.slice(-6)}`;
  const addCommand = [
    "git worktree add",
    "--force",
    "-b",
    shellQuote(branchName),
    shellQuote(workspacePath),
    shellQuote(options.baseRevision),
  ].join(" ");
  const result = await runShellCommand(addCommand, { cwd: options.root });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create worktree for ${options.order.id}: ${result.stderr || result.stdout}`.trim());
  }

  return {
    id: options.workspaceId,
    orderId: options.order.id,
    path: workspacePath,
    branchName,
    baseBranch: options.baseBranch,
    baseRevision: options.baseRevision,
    strategy: "worktree",
    cleanupStatus: "kept",
    isolationReason: options.reason,
    locked: false,
    status: "ready",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  };
}

async function resolveBaseRevision(root: string, baseBranch: string): Promise<string> {
  const base = await runShellCommand(`git rev-parse --verify ${shellQuote(baseBranch)}`, { cwd: root });

  if (base.exitCode === 0 && base.stdout.trim()) {
    return base.stdout.trim();
  }

  const head = await runShellCommand("git rev-parse HEAD", { cwd: root });
  if (head.exitCode !== 0 || !head.stdout.trim()) {
    throw new Error(`Unable to resolve git base revision: ${head.stderr || head.stdout}`.trim());
  }

  return head.stdout.trim();
}

async function resolveCurrentBranch(root: string): Promise<string> {
  const branch = await runShellCommand("git rev-parse --abbrev-ref HEAD", { cwd: root });

  if (branch.exitCode !== 0 || !branch.stdout.trim()) {
    return "HEAD";
  }

  return branch.stdout.trim();
}

function mapWorkspaceRow(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    path: row.path,
    branchName: row.branch_name,
    baseBranch: row.base_branch,
    baseRevision: row.base_revision,
    strategy: row.strategy,
    cleanupStatus: row.cleanup_status,
    isolationReason: row.isolation_reason,
    locked: row.locked === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeRef(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_-]+/g, "-");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
