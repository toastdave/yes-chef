import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../core/models.ts";

export function renderStatusBoard(input: {
  menus: MenuRecord[];
  orders: OrderRecord[];
  workspaces: WorkspaceRecord[];
}): string {
  const activeMenu = input.menus[0];

  if (!activeMenu) {
    return "Yes Chef - Service Board\nNo active menus.";
  }

  return [
    "Yes Chef - Service Board",
    `Menu: ${activeMenu.id}`,
    `Objective: ${activeMenu.objective}`,
    "",
    ...input.orders.map(
      (order) =>
        `[ ${labelForOrder(order)} ] ${order.title} (${order.agentId} -> ${order.backend}${order.backendAgent ? `:${order.backendAgent}` : ""}, ${order.mode}, retry ${order.retryCount})`,
    ),
    input.workspaces.length > 0 ? "" : null,
    ...input.workspaces.map(
      (workspace) =>
        `workspace ${workspace.id}: ${workspace.status} ${workspace.strategy}/${workspace.cleanupStatus} -> ${workspace.path} (${workspace.isolationReason})`,
    ),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function labelForOrder(order: OrderRecord): string {
  if (order.status === "running") return `${order.role.padEnd(13)} cook`;
  if (order.status === "completed") return `${order.role.padEnd(13)} plated`;
  if (order.status === "failed") return `${order.role.padEnd(13)} blocked`;
  return `${order.role.padEnd(13)} mise en place`;
}
