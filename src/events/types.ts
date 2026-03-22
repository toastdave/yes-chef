import type { RoleName } from "../core/models.ts";

export const eventTypes = [
  "menu.created",
  "menu.revised",
  "order.created",
  "order.queued",
  "order.runnable",
  "order.blocked",
  "run.started",
  "run.log",
  "run.completed",
  "run.failed",
  "artifact.created",
  "workspace.created",
  "workspace.locked",
  "validation.started",
  "validation.passed",
  "validation.failed",
  "review.started",
  "review.completed",
  "retry.scheduled",
  "approval.required",
  "service.completed",
] as const;

export type EventType = (typeof eventTypes)[number];
export type KitchenPhase = "Order In" | "Mise en Place" | "Prep" | "Cook" | "Expo" | "Critic" | "Pass" | "Plated";

export interface YesChefEvent {
  id: string;
  ts: string;
  type: EventType;
  menu_id: string | null;
  order_id: string | null;
  run_id: string | null;
  role: RoleName | null;
  payload: Record<string, unknown>;
}

export interface EventInput {
  type: EventType;
  menu_id?: string | null;
  order_id?: string | null;
  run_id?: string | null;
  role?: RoleName | null;
  payload?: Record<string, unknown>;
}

export function kitchenPhaseForEvent(type: EventType): KitchenPhase {
  if (type.startsWith("menu.")) return "Prep";
  if (type.startsWith("order.")) return "Mise en Place";
  if (type.startsWith("run.")) return "Cook";
  if (type.startsWith("validation.")) return "Expo";
  if (type.startsWith("review.")) return "Critic";
  if (type === "approval.required") return "Pass";
  if (type === "service.completed") return "Plated";
  return "Order In";
}
