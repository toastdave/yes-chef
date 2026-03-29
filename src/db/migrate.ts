import type { Database } from "bun:sqlite";

import { ensureRuntimePaths } from "../core/fs.ts";
import { getDatabase } from "./client.ts";
import { schemaStatements } from "./schema.ts";

const additiveColumns: Array<{ table: string; column: string; definition: string }> = [
  { table: "orders", column: "agent_id", definition: "TEXT NOT NULL DEFAULT 'line-cook'" },
  { table: "orders", column: "model", definition: "TEXT NOT NULL DEFAULT 'gpt-5-codex'" },
  { table: "orders", column: "mode", definition: "TEXT NOT NULL DEFAULT 'managed'" },
  { table: "orders", column: "backend_agent", definition: "TEXT" },
  { table: "orders", column: "repair_for_order_id", definition: "TEXT" },
  { table: "orders", column: "source_run_id", definition: "TEXT" },
  { table: "orders", column: "retry_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "orders", column: "failure_context_json", definition: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "orders", column: "isolation_strategy", definition: "TEXT NOT NULL DEFAULT 'in-place'" },
  { table: "orders", column: "isolation_reason", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "orders", column: "tools_json", definition: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "orders", column: "permissions_json", definition: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "orders", column: "routing_reasons_json", definition: "TEXT NOT NULL DEFAULT '[]'" },
  { table: "orders", column: "knowledge_sources_json", definition: "TEXT NOT NULL DEFAULT '[]'" },
  { table: "orders", column: "overlay_context_json", definition: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "runs", column: "agent_id", definition: "TEXT NOT NULL DEFAULT 'line-cook'" },
  { table: "runs", column: "mode", definition: "TEXT NOT NULL DEFAULT 'managed'" },
  { table: "runs", column: "backend_agent", definition: "TEXT" },
  { table: "runs", column: "routing_context_json", definition: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "workspaces", column: "base_revision", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "workspaces", column: "strategy", definition: "TEXT NOT NULL DEFAULT 'in-place'" },
  { table: "workspaces", column: "cleanup_status", definition: "TEXT NOT NULL DEFAULT 'kept'" },
  { table: "workspaces", column: "isolation_reason", definition: "TEXT NOT NULL DEFAULT ''" },
];

export async function migrateDatabase(root = process.cwd()): Promise<void> {
  await ensureRuntimePaths(root);
  const db = getDatabase(root);

  for (const statement of schemaStatements) {
    db.exec(statement);
  }

  for (const column of additiveColumns) {
    ensureColumn(db, column.table, column.column, column.definition);
  }
}

function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = rows.some((row) => row.name === column);

  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
