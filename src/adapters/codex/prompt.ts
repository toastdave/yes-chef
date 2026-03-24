import type { MenuRecord, OrderRecord } from "../../core/models.ts";

export function buildCodexPrompt(menu: MenuRecord, order: OrderRecord): string {
  const toolList = Object.keys(order.tools);

  return [
    `You are acting as ${order.role} for Yes Chef.`,
    `Yes Chef agent: ${order.agentId}`,
    `Execution mode: ${order.mode}`,
    order.backendAgent ? `Requested backend agent: ${order.backendAgent}` : null,
    `Menu ID: ${menu.id}`,
    `Objective: ${menu.objective}`,
    `Order ID: ${order.id}`,
    `Order: ${order.title}`,
    `Model: ${order.model}`,
    `Backend: ${order.backend}`,
    `Prompt template: ${order.promptTemplate}`,
    `Tools: ${toolList.join(", ") || "inherit"}`,
    `Permissions: ${JSON.stringify(order.permissions)}`,
    `Validations required: ${order.validationsRequired.join(", ") || "none"}`,
    "Return concise progress and final summary through stdout.",
    "",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
