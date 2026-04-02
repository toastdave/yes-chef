import type { BackendCapabilityObservation } from "../core/backend-observations.ts";
import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../core/models.ts";

export function renderStatusBoard(input: {
  menus: MenuRecord[];
  orders: OrderRecord[];
  workspaces: WorkspaceRecord[];
  backendObservations: BackendCapabilityObservation[];
}): string {
  const activeMenu = input.menus[0];

  if (!activeMenu) {
    return [
      "Yes Chef - Service Board",
      "No active menus.",
      ...renderBackendObservationLines(input.backendObservations),
    ].join("\n");
  }

  return [
    "Yes Chef - Service Board",
    `Menu: ${activeMenu.id}`,
    `Objective: ${activeMenu.objective}`,
    "",
    ...input.orders.map(
      (order) => `[ ${labelForOrder(order)} ] ${order.title}${orderMeta(order)}`,
    ),
    input.workspaces.length > 0 ? "" : null,
    ...input.workspaces.map(
      (workspace) =>
        `workspace ${workspace.id}: ${workspace.status} ${workspace.strategy}/${workspace.cleanupStatus} -> ${workspace.path} (${workspace.isolationReason})`,
    ),
    ...renderBackendObservationLines(input.backendObservations),
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

function orderMeta(order: OrderRecord): string {
  const reviewAssessment = order.failureContext.reviewAssessment as { category?: string } | undefined;
  const dangerousPaths = Array.isArray(order.overlayContext.matchedDangerousPaths)
    ? order.overlayContext.matchedDangerousPaths.length
    : 0;
  const capability = `${order.skills.length > 0 ? ` skills:${order.skills.join("+")}` : ""}${order.packs.length > 0 ? ` packs:${order.packs.join("+")}` : ""}${order.knowledgeSources.length > 0 ? ` knowledge:${order.knowledgeSources.length}` : ""}${dangerousPaths > 0 ? ` risky:${dangerousPaths}` : ""}`;
  const relation = order.kind === "repair"
    ? ` repair-for ${order.repairForOrderId}${reviewAssessment?.category ? ` ${reviewAssessment.category}` : ""}`
    : order.kind === "review"
      ? ` review${typeof order.failureContext.reviewTargetOrderId === "string" ? ` for ${order.failureContext.reviewTargetOrderId}` : ""}${reviewAssessment?.category ? ` ${reviewAssessment.category}` : ""}`
      : ` ${order.kind}`;

  return ` (${order.agentId} -> ${order.backend}${order.backendAgent ? `:${order.backendAgent}` : ""}, ${order.mode}, retry ${order.retryCount},${relation}${capability})`;
}

function renderBackendObservationLines(observations: BackendCapabilityObservation[]): string[] {
  if (observations.length === 0) {
    return [];
  }

  return [
    "",
    "Backend Learning:",
    ...observations.map(
      (observation) =>
        `backend ${observation.backendId}: runs=${observation.sampleCount}, managed=${observation.managedSuccess}, delegate=${observation.delegateSuccess}, write=${observation.writeSuccess}, browser=${observation.browserSuccess}, tools=${observation.toolSurfaces.join("/") || "none"}`,
    ),
  ];
}
