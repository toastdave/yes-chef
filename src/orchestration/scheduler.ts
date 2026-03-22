import type { Database } from "bun:sqlite";

import type { OrderRecord } from "../core/models.ts";
import { listRunnableOrders } from "./orders.ts";

export function getNextRunnableOrders(db: Database, menuId: string): OrderRecord[] {
  return listRunnableOrders(db, menuId);
}
