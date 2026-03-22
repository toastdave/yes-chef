import type { MenuRecord, OrderRecord } from "../../core/models.ts";

export function buildCodexPrompt(menu: MenuRecord, order: OrderRecord): string {
  return [
    `You are acting as ${order.role} for Yes Chef.`,
    `Menu ID: ${menu.id}`,
    `Objective: ${menu.objective}`,
    `Order ID: ${order.id}`,
    `Order: ${order.title}`,
    `Prompt template: ${order.promptTemplate}`,
    `Validations required: ${order.validationsRequired.join(", ") || "none"}`,
    "Return concise progress and final summary through stdout.",
    "",
  ].join("\n");
}
