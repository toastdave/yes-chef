import type { KnowledgeContext } from "../../knowledge/context.ts";
import type { MenuRecord, OrderRecord } from "../../core/models.ts";

export function buildCodexPrompt(menu: MenuRecord, order: OrderRecord, knowledge?: KnowledgeContext): string {
  const toolList = Object.keys(order.tools);
  const references = knowledge ? knowledge.results.map((result) => `- ${result.title} [${result.sourceType}] ${result.path}\n  ${result.snippet}`) : [];
  const dangerousPaths = formatOverlayList(order.overlayContext, "matchedDangerousPaths");
  const acceptanceCriteria = formatOverlayList(order.overlayContext, "acceptanceCriteria");
  const repoMap = formatOverlayList(order.overlayContext, "repoMap");
  const architectureNotes = formatOverlayList(order.overlayContext, "architectureNotes");
  const commands = formatOverlayCommands(order.overlayContext);

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
    `Dangerous paths: ${dangerousPaths || "none"}`,
    `Acceptance criteria: ${acceptanceCriteria || "none"}`,
    repoMap ? `Repo map: ${repoMap}` : null,
    architectureNotes ? `Architecture notes: ${architectureNotes}` : null,
    commands ? `Overlay commands: ${commands}` : null,
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

function formatOverlayList(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "";
}

function formatOverlayCommands(context: Record<string, unknown>): string {
  const value = context.commands;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  return Object.entries(value as Record<string, string>).map(([key, command]) => `${key}=${command}`).join("; ");
}
