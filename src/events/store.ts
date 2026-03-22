import type { Database } from "bun:sqlite";

import { appendJsonLine, resolveRuntimePaths } from "../core/fs.ts";
import type { YesChefEvent } from "./types.ts";

interface EventRow {
  id: string;
  ts: string;
  type: string;
  menu_id: string | null;
  order_id: string | null;
  run_id: string | null;
  role: string | null;
  payload_json: string;
}

export async function persistEvent(db: Database, root: string, event: YesChefEvent): Promise<void> {
  db.query(
    `INSERT INTO events (id, ts, type, menu_id, order_id, run_id, role, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(event.id, event.ts, event.type, event.menu_id, event.order_id, event.run_id, event.role, JSON.stringify(event.payload));

  const paths = resolveRuntimePaths(root);
  await appendJsonLine(paths.eventLogPath, event);
}

export function listEvents(db: Database, menuId?: string | null): YesChefEvent[] {
  const rows = menuId
    ? (db
        .query(`SELECT * FROM events WHERE menu_id = ? ORDER BY ts ASC`)
        .all(menuId) as EventRow[])
    : ((db.query(`SELECT * FROM events ORDER BY ts ASC`).all() as EventRow[]) ?? []);

  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    type: row.type as YesChefEvent["type"],
    menu_id: row.menu_id,
    order_id: row.order_id,
    run_id: row.run_id,
    role: row.role as YesChefEvent["role"],
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  }));
}
