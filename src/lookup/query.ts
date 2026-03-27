import type { Database } from "bun:sqlite";

import { searchKnowledgeDocuments } from "../knowledge/search.ts";
import type { LookupResponse, LookupStateResult } from "./types.ts";

interface MenuRow {
  id: string;
  title: string;
  objective: string;
  status: string;
}

interface OrderRow {
  id: string;
  menu_id: string;
  title: string;
  kind: string;
  role: string;
  agent_id: string;
  status: string;
}

interface RunRow {
  id: string;
  order_id: string;
  backend: string;
  model: string;
  status: string;
  summary: string | null;
}

interface WorkspaceRow {
  id: string;
  order_id: string;
  path: string;
  branch_name: string;
  strategy: string;
  status: string;
}

interface ValidationRow {
  id: string;
  menu_id: string;
  name: string;
  command: string;
  status: string;
}

export function lookupStateAndKnowledge(
  db: Database,
  query: string,
  options: { sourceTypes?: string[]; limit?: number } = {},
): LookupResponse {
  const limit = options.limit ?? 6;
  const state = searchState(db, query, limit);
  const knowledge = searchKnowledgeDocuments(db, query, {
    limit,
    sourceTypes: options.sourceTypes,
  });

  return {
    query,
    sourceTypes: options.sourceTypes ?? [],
    state,
    knowledge,
  };
}

function searchState(db: Database, query: string, limit: number): LookupStateResult[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const terms = normalized.split(/\s+/).filter(Boolean);
  const results = [
    ...searchMenus(db, terms, limit),
    ...searchOrders(db, terms, limit),
    ...searchRuns(db, terms, limit),
    ...searchWorkspaces(db, terms, limit),
    ...searchValidations(db, terms, limit),
  ];

  return results
    .sort((left, right) => score(right, terms) - score(left, terms))
    .slice(0, limit);
}

function searchMenus(db: Database, terms: string[], limit: number): LookupStateResult[] {
  const rows = db.query(`SELECT id, title, objective, status FROM menus ORDER BY updated_at DESC LIMIT 50`).all() as MenuRow[];
  return rows
    .filter((row) => matches([row.id, row.title, row.objective, row.status], terms))
    .slice(0, limit)
    .map((row) => ({
      kind: "menu",
      id: row.id,
      title: row.title,
      summary: row.objective,
      status: row.status,
      relatedId: null,
    }));
}

function searchOrders(db: Database, terms: string[], limit: number): LookupStateResult[] {
  const rows = db.query(
    `SELECT id, menu_id, title, kind, role, agent_id, status FROM orders ORDER BY updated_at DESC LIMIT 100`,
  ).all() as OrderRow[];
  return rows
    .filter((row) => matches([row.id, row.menu_id, row.title, row.kind, row.role, row.agent_id, row.status], terms))
    .slice(0, limit)
    .map((row) => ({
      kind: "order",
      id: row.id,
      title: row.title,
      summary: `${row.kind} ${row.role} via ${row.agent_id}`,
      status: row.status,
      relatedId: row.menu_id,
    }));
}

function searchRuns(db: Database, terms: string[], limit: number): LookupStateResult[] {
  const rows = db.query(
    `SELECT id, order_id, backend, model, status, summary FROM runs ORDER BY updated_at DESC LIMIT 100`,
  ).all() as RunRow[];
  return rows
    .filter((row) => matches([row.id, row.order_id, row.backend, row.model, row.status, row.summary ?? ""], terms))
    .slice(0, limit)
    .map((row) => ({
      kind: "run",
      id: row.id,
      title: `Run ${row.id}`,
      summary: `${row.backend} ${row.model}${row.summary ? ` - ${row.summary}` : ""}`,
      status: row.status,
      relatedId: row.order_id,
    }));
}

function searchWorkspaces(db: Database, terms: string[], limit: number): LookupStateResult[] {
  const rows = db.query(
    `SELECT id, order_id, path, branch_name, strategy, status FROM workspaces ORDER BY updated_at DESC LIMIT 100`,
  ).all() as WorkspaceRow[];
  return rows
    .filter((row) => matches([row.id, row.order_id, row.path, row.branch_name, row.strategy, row.status], terms))
    .slice(0, limit)
    .map((row) => ({
      kind: "workspace",
      id: row.id,
      title: row.branch_name,
      summary: `${row.strategy} ${row.path}`,
      status: row.status,
      relatedId: row.order_id,
    }));
}

function searchValidations(db: Database, terms: string[], limit: number): LookupStateResult[] {
  const rows = db.query(
    `SELECT id, menu_id, name, command, status FROM validations ORDER BY started_at DESC LIMIT 100`,
  ).all() as ValidationRow[];
  return rows
    .filter((row) => matches([row.id, row.menu_id, row.name, row.command, row.status], terms))
    .slice(0, limit)
    .map((row) => ({
      kind: "validation",
      id: row.id,
      title: row.name,
      summary: row.command,
      status: row.status,
      relatedId: row.menu_id,
    }));
}

function matches(fields: string[], terms: string[]): boolean {
  const haystack = fields.join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function score(result: LookupStateResult, terms: string[]): number {
  const haystack = `${result.title} ${result.summary} ${result.status} ${result.id} ${result.relatedId ?? ""}`.toLowerCase();
  return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
}
