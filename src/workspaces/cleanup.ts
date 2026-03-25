import type { Database } from "bun:sqlite";

import type { YesChefConfig } from "../core/config.ts";
import { runShellCommand } from "../core/exec.ts";
import type { WorkspaceRecord } from "../core/models.ts";

export async function releaseWorkspace(
  db: Database,
  root: string,
  config: YesChefConfig,
  workspace: WorkspaceRecord,
  failed: boolean,
): Promise<void> {
  let cleanupStatus: WorkspaceRecord["cleanupStatus"] = workspace.cleanupStatus;

  if (workspace.strategy === "worktree") {
    const shouldDelete = failed ? !config.policies.worktrees.keepFailed : config.policies.worktrees.cleanup === "delete";

    if (shouldDelete) {
      await removeWorktree(root, workspace.path, workspace.branchName);
      cleanupStatus = "removed";
    }
  }

  db.query(`UPDATE workspaces SET locked = 0, status = ?, cleanup_status = ?, updated_at = ? WHERE id = ?`).run(
    "released",
    cleanupStatus,
    new Date().toISOString(),
    workspace.id,
  );
}

async function removeWorktree(root: string, workspacePath: string, branchName: string): Promise<void> {
  const remove = await runShellCommand(`git worktree remove --force ${shellQuote(workspacePath)}`, { cwd: root });

  if (remove.exitCode !== 0) {
    throw new Error(`Failed to remove worktree ${workspacePath}: ${remove.stderr || remove.stdout}`.trim());
  }

  const branch = await runShellCommand(`git branch -D ${shellQuote(branchName)}`, { cwd: root });
  if (branch.exitCode !== 0 && !branch.stderr.includes("not found")) {
    throw new Error(`Failed to delete worktree branch ${branchName}: ${branch.stderr || branch.stdout}`.trim());
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
