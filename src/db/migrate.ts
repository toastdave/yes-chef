import type { Database } from "bun:sqlite";

import { ensureRuntimePaths } from "../core/fs.ts";
import { getDatabase } from "./client.ts";
import { schemaStatements } from "./schema.ts";

const additiveColumns: Array<{ table: string; column: string; definition: string }> = [
  { table: "orders", column: "agent_id", definition: "TEXT NOT NULL DEFAULT 'line-cook'" },
  { table: "orders", column: "model", definition: "TEXT NOT NULL DEFAULT 'gpt-5-codex'" },
  { table: "runs", column: "agent_id", definition: "TEXT NOT NULL DEFAULT 'line-cook'" },
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
