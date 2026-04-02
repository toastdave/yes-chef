import type { Database } from "bun:sqlite";

import type { BackendCapabilities } from "./backends.ts";
import { resolveBackendCapabilities } from "./backends.ts";
import type { YesChefConfig } from "./config.ts";
import type { OrderRecord } from "./models.ts";
import { parseJsonValue } from "./models.ts";

interface BackendObservationRow {
  backend_id: string;
  managed_success: number;
  delegate_success: number;
  write_success: number;
  browser_success: number;
  tool_surfaces_json: string;
  sample_count: number;
  updated_at: string;
}

export interface BackendCapabilityObservation {
  backendId: string;
  managedSuccess: boolean;
  delegateSuccess: boolean;
  writeSuccess: boolean;
  browserSuccess: boolean;
  toolSurfaces: string[];
  sampleCount: number;
  updatedAt: string;
}

export function recordBackendCapabilityObservation(db: Database, order: OrderRecord): void {
  const existing = getBackendCapabilityObservation(db, order.backend);
  const next = mergeObservation(existing, order);

  db.query(
    `INSERT INTO backend_capability_observations (
      backend_id, managed_success, delegate_success, write_success, browser_success, tool_surfaces_json, sample_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(backend_id) DO UPDATE SET
      managed_success = excluded.managed_success,
      delegate_success = excluded.delegate_success,
      write_success = excluded.write_success,
      browser_success = excluded.browser_success,
      tool_surfaces_json = excluded.tool_surfaces_json,
      sample_count = excluded.sample_count,
      updated_at = excluded.updated_at`,
  ).run(
    next.backendId,
    next.managedSuccess ? 1 : 0,
    next.delegateSuccess ? 1 : 0,
    next.writeSuccess ? 1 : 0,
    next.browserSuccess ? 1 : 0,
    JSON.stringify(next.toolSurfaces),
    next.sampleCount,
    next.updatedAt,
  );
}

export function getObservedBackendCapabilities(db: Database, config: YesChefConfig): Record<string, BackendCapabilities> {
  const observations = listBackendCapabilityObservations(db);
  const observationMap = new Map(observations.map((observation) => [observation.backendId, observation]));

  return Object.fromEntries(
    Object.entries(config.backends).map(([backendId, backend]) => {
      const base = resolveBackendCapabilities(backendId, backend);
      const observation = observationMap.get(backendId);
      return [backendId, mergeObservedCapabilities(base, observation ?? null)];
    }),
  );
}

export function listBackendCapabilityObservations(db: Database): BackendCapabilityObservation[] {
  const rows = db.query(
    `SELECT backend_id, managed_success, delegate_success, write_success, browser_success, tool_surfaces_json, sample_count, updated_at
     FROM backend_capability_observations ORDER BY backend_id ASC`,
  ).all() as BackendObservationRow[];

  return rows.map(mapObservationRow);
}

export function mergeObservedCapabilities(
  base: BackendCapabilities,
  observation: BackendCapabilityObservation | null,
): BackendCapabilities {
  if (!observation) {
    return base;
  }

  return {
    managed: base.managed || observation.managedSuccess,
    delegate: base.delegate || observation.delegateSuccess,
    browser: base.browser || observation.browserSuccess,
    patching: base.patching === "none" && observation.writeSuccess ? "edit" : base.patching,
    toolSurfaces: [...new Set([...base.toolSurfaces, ...observation.toolSurfaces])].sort(),
  };
}

function getBackendCapabilityObservation(db: Database, backendId: string): BackendCapabilityObservation | null {
  const row = db.query(
    `SELECT backend_id, managed_success, delegate_success, write_success, browser_success, tool_surfaces_json, sample_count, updated_at
     FROM backend_capability_observations WHERE backend_id = ?`,
  ).get(backendId) as BackendObservationRow | null;

  return row ? mapObservationRow(row) : null;
}

function mergeObservation(
  existing: BackendCapabilityObservation | null,
  order: OrderRecord,
): BackendCapabilityObservation {
  const observedTools = Object.entries(order.tools)
    .filter(([, enabled]) => enabled === true)
    .map(([tool]) => tool)
    .sort();
  const now = new Date().toISOString();

  return {
    backendId: order.backend,
    managedSuccess: (existing?.managedSuccess ?? false) || order.mode === "managed",
    delegateSuccess: (existing?.delegateSuccess ?? false) || order.mode === "delegate",
    writeSuccess: (existing?.writeSuccess ?? false) || isWriteOrder(order),
    browserSuccess: (existing?.browserSuccess ?? false) || observedTools.includes("browser"),
    toolSurfaces: [...new Set([...(existing?.toolSurfaces ?? []), ...observedTools])].sort(),
    sampleCount: (existing?.sampleCount ?? 0) + 1,
    updatedAt: now,
  };
}

function mapObservationRow(row: BackendObservationRow): BackendCapabilityObservation {
  return {
    backendId: row.backend_id,
    managedSuccess: row.managed_success === 1,
    delegateSuccess: row.delegate_success === 1,
    writeSuccess: row.write_success === 1,
    browserSuccess: row.browser_success === 1,
    toolSurfaces: parseJsonValue<string[]>(row.tool_surfaces_json, []).sort(),
    sampleCount: row.sample_count,
    updatedAt: row.updated_at,
  };
}

function isWriteOrder(order: OrderRecord): boolean {
  return order.kind === "implement" || order.kind === "repair" || order.kind === "rules-update" || order.kind === "merge";
}
