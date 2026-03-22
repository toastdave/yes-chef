import type { Database } from "bun:sqlite";

import type { WorkspaceRecord } from "../core/models.ts";

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

export function listWorkspaceRecords(db: Database): WorkspaceRecord[] {
  const rows = db.query(`SELECT * FROM workspaces ORDER BY created_at DESC`).all() as WorkspaceRow[];
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    path: row.path,
    branchName: row.branch_name,
    baseBranch: row.base_branch,
    locked: row.locked === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
