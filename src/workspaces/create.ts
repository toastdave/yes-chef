import type { Database } from "bun:sqlite";

import type { YesChefConfig } from "../core/config.ts";
import { createId } from "../core/ids.ts";
import type { OrderRecord, WorkspaceRecord } from "../core/models.ts";

interface WorkspaceRow {
  id: string;
  order_id: string;
  path: string;
  branch_name: string;
  base_branch: string;
  locked: number;
  status: WorkspaceRecord["status"];
  created_at: string;
  updated_at: string;
}

export function ensureWorkspace(db: Database, root: string, config: YesChefConfig, order: OrderRecord): WorkspaceRecord {
  const existing = db.query(`SELECT * FROM workspaces WHERE order_id = ?`).get(order.id) as WorkspaceRow | null;

  if (existing) {
    return mapWorkspaceRow(existing);
  }

  const now = new Date().toISOString();
  const workspace: WorkspaceRecord = {
    id: createId("W"),
    orderId: order.id,
    path: root,
    branchName: `yeschef/${order.id}`,
    baseBranch: config.project.baseBranch,
    locked: false,
    status: "attached",
    createdAt: now,
    updatedAt: now,
  };

  db.query(
    `INSERT INTO workspaces (id, order_id, path, branch_name, base_branch, locked, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    workspace.id,
    workspace.orderId,
    workspace.path,
    workspace.branchName,
    workspace.baseBranch,
    workspace.locked ? 1 : 0,
    workspace.status,
    workspace.createdAt,
    workspace.updatedAt,
  );

  return workspace;
}

function mapWorkspaceRow(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    path: row.path,
    branchName: row.branch_name,
    baseBranch: row.base_branch,
    locked: row.locked === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
