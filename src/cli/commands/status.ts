import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";
import { renderStatusBoard } from "../render.ts";

interface StatusResponse {
  menus: MenuRecord[];
  orders: OrderRecord[];
  workspaces: WorkspaceRecord[];
}

export async function runStatusCommand(): Promise<void> {
  const status = await daemonRequest<StatusResponse>("/status");
  console.log(renderStatusBoard(status));
}
