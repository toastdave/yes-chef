import type { Database } from "bun:sqlite";

import type { MenuRecord, OrderRecord } from "../core/models.ts";
import { listOrdersByMenu } from "./orders.ts";

type EffectiveChainState = "completed" | "running" | "blocked" | "prepared";

export function reconcileMenuStatus(db: Database, menuId: string): MenuRecord["status"] {
  const orders = listOrdersByMenu(db, menuId);

  if (orders.length === 0) {
    return "prepared";
  }

  const repairsByParent = new Map<string, OrderRecord[]>();
  for (const order of orders) {
    if (!order.repairForOrderId) {
      continue;
    }

    const repairs = repairsByParent.get(order.repairForOrderId) ?? [];
    repairs.push(order);
    repairsByParent.set(order.repairForOrderId, repairs);
  }

  const roots = orders.filter((order) => !order.repairForOrderId);
  const effectiveStates = (roots.length > 0 ? roots : orders).map((order) => effectiveOrderState(order, repairsByParent));

  if (effectiveStates.every((state) => state === "completed")) {
    return "completed";
  }

  if (effectiveStates.some((state) => state === "blocked")) {
    return "blocked";
  }

  if (effectiveStates.some((state) => state === "running")) {
    return "running";
  }

  return "prepared";
}

function effectiveOrderState(order: OrderRecord, repairsByParent: Map<string, OrderRecord[]>): EffectiveChainState {
  if (order.status === "completed") {
    return "completed";
  }

  if (order.status === "running") {
    return "running";
  }

  if (order.status === "pending" || order.status === "queued") {
    return "prepared";
  }

  const repairs = [...(repairsByParent.get(order.id) ?? [])].sort((left, right) => {
    if (left.retryCount !== right.retryCount) {
      return left.retryCount - right.retryCount;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });

  for (const repair of repairs.reverse()) {
    const state = effectiveOrderState(repair, repairsByParent);
    if (state === "completed") {
      return "completed";
    }

    if (state === "running" || state === "prepared") {
      return "running";
    }
  }

  return order.status === "failed" || order.status === "blocked" ? "blocked" : "prepared";
}
