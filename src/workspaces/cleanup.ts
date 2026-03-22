import type { Database } from "bun:sqlite";

export function releaseWorkspace(db: Database, workspaceId: string): void {
  db.query(`UPDATE workspaces SET locked = 0, status = ?, updated_at = ? WHERE id = ?`).run(
    "released",
    new Date().toISOString(),
    workspaceId,
  );
}
