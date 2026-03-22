import type { Database } from "bun:sqlite";

import type { MenuRecord } from "../core/models.ts";
import { listOrdersByMenu } from "./orders.ts";

export function reconcileMenuStatus(db: Database, menuId: string): MenuRecord["status"] {
  const orders = listOrdersByMenu(db, menuId);

  if (orders.length === 0) {
    return "prepared";
  }

  if (orders.some((order) => order.status === "failed" || order.status === "blocked")) {
    return "blocked";
  }

  if (orders.every((order) => order.status === "completed")) {
    return "completed";
  }

  if (orders.some((order) => order.status === "running")) {
    return "running";
  }

  return "prepared";
}
