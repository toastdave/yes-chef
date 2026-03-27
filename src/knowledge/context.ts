import type { Database } from "bun:sqlite";

import type { MenuRecord, OrderRecord } from "../core/models.ts";
import { searchKnowledgeDocuments } from "./search.ts";
import type { KnowledgeSearchResult } from "./types.ts";

export interface KnowledgeContext {
  query: string;
  results: KnowledgeSearchResult[];
}

export function buildKnowledgeContextForGoal(db: Database, goal: string, limit = 3): KnowledgeContext {
  return searchWithFallback(db, [goal], limit);
}

export function buildKnowledgeContextForOrder(
  db: Database,
  menu: MenuRecord,
  order: OrderRecord,
  limit = 4,
): KnowledgeContext {
  return searchWithFallback(
    db,
    [
      `${menu.objective} ${order.title}`,
      order.title,
      menu.objective,
      order.skills.join(" "),
      order.validationsRequired.join(" "),
    ],
    limit,
  );
}

export function buildKnowledgeContextForRepairTarget(db: Database, order: OrderRecord, limit = 4): KnowledgeContext {
  return searchWithFallback(
    db,
    [order.title, order.skills.join(" "), order.validationsRequired.join(" ")],
    limit,
  );
}

export function formatKnowledgeReferences(results: KnowledgeSearchResult[]): string[] {
  return results.map((result) => `${result.title} (${result.path}) - ${result.snippet}`);
}

function buildSearchQuery(parts: string[]): string {
  return parts
    .flatMap((part) => part.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .slice(0, 12)
    .join(" ");
}

function searchWithFallback(db: Database, candidates: string[], limit: number): KnowledgeContext {
  for (const candidate of candidates) {
    const query = buildSearchQuery([candidate]);

    if (!query) {
      continue;
    }

    const results = searchKnowledgeDocuments(db, query, limit);
    if (results.length > 0) {
      return { query, results };
    }
  }

  return { query: buildSearchQuery(candidates), results: [] };
}
