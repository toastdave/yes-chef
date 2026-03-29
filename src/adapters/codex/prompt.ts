import type { KnowledgeContext } from "../../knowledge/context.ts";
import type { MenuRecord, OrderRecord } from "../../core/models.ts";

export function buildCodexPrompt(menu: MenuRecord, order: OrderRecord, knowledge?: KnowledgeContext): string {
  const toolList = Object.keys(order.tools);
  const references = knowledge ? knowledge.results.map((result) => `- ${result.title} [${result.sourceType}] ${result.path}\n  ${result.snippet}`) : [];

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
    `Skills: ${order.skills.join(", ") || "none"}`,
    `Packs: ${order.packs.join(", ") || "none"}`,
    `Routing reasons: ${order.routingReasons.join("; ") || "default"}`,
    `Tools: ${toolList.join(", ") || "inherit"}`,
    `Permissions: ${JSON.stringify(order.permissions)}`,
    `Validations required: ${order.validationsRequired.join(", ") || "none"}`,
    knowledge && knowledge.results.length > 0 ? `Knowledge profile: ${knowledge.profile}` : null,
    knowledge && knowledge.results.length > 0 ? `Knowledge source types: ${knowledge.sourceTypes.join(", ")}` : null,
    knowledge && knowledge.results.length > 0 ? `Knowledge query: ${knowledge.query}` : null,
    knowledge && knowledge.results.length > 0 ? "Relevant local knowledge:" : null,
    ...(knowledge && knowledge.results.length > 0 ? references : []),
    "Return concise progress and final summary through stdout.",
    "",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
