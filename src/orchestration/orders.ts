import type { Database } from "bun:sqlite";

import type { OrderRecord } from "../core/models.ts";
import { parseJsonValue } from "../core/models.ts";

interface OrderRow {
  id: string;
  menu_id: string;
  title: string;
  kind: OrderRecord["kind"];
  role: OrderRecord["role"];
  backend: string;
  profile: string;
  prompt_template: string;
  workspace_id: string | null;
  depends_on_json: string;
  packs_json: string;
  skills_json: string;
  validations_required_json: string;
  retry_limit: number;
  status: OrderRecord["status"];
  priority: number;
  created_at: string;
  updated_at: string;
}

export function insertOrder(db: Database, order: OrderRecord): void {
  db.query(
    `INSERT INTO orders (
      id, menu_id, title, kind, role, backend, profile, prompt_template, workspace_id,
      depends_on_json, packs_json, skills_json, validations_required_json, retry_limit, status,
      priority, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    order.id,
    order.menuId,
    order.title,
    order.kind,
    order.role,
    order.backend,
    order.profile,
    order.promptTemplate,
    order.workspaceId,
    JSON.stringify(order.dependsOn),
    JSON.stringify(order.packs),
    JSON.stringify(order.skills),
    JSON.stringify(order.validationsRequired),
    order.retryLimit,
    order.status,
    order.priority,
    order.createdAt,
    order.updatedAt,
  );
}

export function getOrderById(db: Database, orderId: string): OrderRecord | null {
  const row = db.query(`SELECT * FROM orders WHERE id = ?`).get(orderId) as OrderRow | null;
  return row ? mapOrderRow(row) : null;
}

export function listOrdersByMenu(db: Database, menuId: string): OrderRecord[] {
  const rows = db.query(`SELECT * FROM orders WHERE menu_id = ? ORDER BY priority ASC, created_at ASC`).all(menuId) as OrderRow[];
  return rows.map(mapOrderRow);
}

export function updateOrderStatus(db: Database, orderId: string, status: OrderRecord["status"]): void {
  db.query(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString(), orderId);
}

export function attachWorkspaceToOrder(db: Database, orderId: string, workspaceId: string): void {
  db.query(`UPDATE orders SET workspace_id = ?, updated_at = ? WHERE id = ?`).run(workspaceId, new Date().toISOString(), orderId);
}

export function listRunnableOrders(db: Database, menuId: string): OrderRecord[] {
  const orders = listOrdersByMenu(db, menuId);
  const statusById = new Map(orders.map((order) => [order.id, order.status]));

  return orders.filter((order) => {
    if (!(order.status === "queued" || order.status === "pending")) {
      return false;
    }

    return order.dependsOn.every((dependencyId) => statusById.get(dependencyId) === "completed");
  });
}

function mapOrderRow(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    menuId: row.menu_id,
    title: row.title,
    kind: row.kind,
    role: row.role,
    backend: row.backend,
    profile: row.profile,
    promptTemplate: row.prompt_template,
    workspaceId: row.workspace_id,
    dependsOn: parseJsonValue<string[]>(row.depends_on_json, []),
    packs: parseJsonValue<string[]>(row.packs_json, []),
    skills: parseJsonValue<string[]>(row.skills_json, []),
    validationsRequired: parseJsonValue<string[]>(row.validations_required_json, []),
    retryLimit: row.retry_limit,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
