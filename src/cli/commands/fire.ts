import type { MenuRecord, RunRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";

interface FireResponse {
  menu: MenuRecord;
  runs: RunRecord[];
}

export async function runFireCommand(args: string[]): Promise<void> {
  const menuId = args[0];

  if (!menuId) {
    throw new Error("Usage: yeschef fire <menu-id>");
  }

  const result = await daemonRequest<FireResponse>(`/menus/${menuId}/fire`, {
    method: "POST",
  });

  console.log(`Service finished for ${result.menu.id}`);
  console.log(`Status: ${result.menu.status}`);
  console.log(`Runs: ${result.runs.length}`);
}
