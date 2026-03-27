import type { Database } from "bun:sqlite";

import type { MenuRecord, OrderRecord } from "../core/models.ts";
import { searchKnowledgeDocuments } from "./search.ts";
import type { KnowledgeSearchResult } from "./types.ts";

export interface KnowledgeContext {
  query: string;
  profile: string;
  sourceTypes: string[];
  results: KnowledgeSearchResult[];
}

interface KnowledgeProfile {
  name: string;
  sourceTypes: string[];
  limit: number;
}

const knowledgeProfiles = {
  planner: {
    name: "planner",
    sourceTypes: ["repo-rules", "prd", "project-doc", "project-config", "agent"],
    limit: 4,
  },
  implementer: {
    name: "implementer",
    sourceTypes: ["repo-rules", "project-doc", "prd", "prompt", "agent"],
    limit: 4,
  },
  repair: {
    name: "repair",
    sourceTypes: ["repo-rules", "prd", "prompt", "agent", "project-doc"],
    limit: 5,
  },
  critic: {
    name: "critic",
    sourceTypes: ["repo-rules", "prd", "project-doc", "agent"],
    limit: 5,
  },
} satisfies Record<string, KnowledgeProfile>;

export function buildKnowledgeContextForGoal(db: Database, goal: string, limit = knowledgeProfiles.planner.limit): KnowledgeContext {
  return searchWithFallback(db, [goal], { ...knowledgeProfiles.planner, limit });
}

export function buildKnowledgeContextForOrder(
  db: Database,
  menu: MenuRecord,
  order: OrderRecord,
  limit = knowledgeProfiles.implementer.limit,
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
    { ...knowledgeProfiles.implementer, limit },
  );
}

export function buildKnowledgeContextForRepairTarget(
  db: Database,
  order: OrderRecord,
  limit = knowledgeProfiles.repair.limit,
): KnowledgeContext {
  return searchWithFallback(
    db,
    [order.title, order.skills.join(" "), order.validationsRequired.join(" ")],
    { ...knowledgeProfiles.repair, limit },
  );
}

export function buildKnowledgeContextForReview(
  db: Database,
  menu: MenuRecord,
  targetOrder: OrderRecord,
  limit = knowledgeProfiles.critic.limit,
): KnowledgeContext {
  return searchWithFallback(
    db,
    [
      `${menu.objective} ${targetOrder.title}`,
      targetOrder.title,
      targetOrder.skills.join(" "),
      targetOrder.validationsRequired.join(" "),
    ],
    { ...knowledgeProfiles.critic, limit },
  );
}

export function formatKnowledgeReferences(results: KnowledgeSearchResult[]): string[] {
  return results.map((result) => `${result.title} (${result.path}) - ${result.snippet}`);
}

export function inferKnowledgeSignals(context: KnowledgeContext): string[] {
  const signals = new Set<string>();

  for (const result of context.results) {
    if (result.sourceType === "repo-rules") {
      signals.add("repo-rules");
    }

    if (result.sourceType === "prd") {
      signals.add("prd");
    }

    if (result.sourceType === "agent" || result.sourceType === "prompt") {
      signals.add("workflow");
    }
  }

  return [...signals];
}

function buildSearchQuery(parts: string[]): string {
  return parts
    .flatMap((part) => part.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .slice(0, 12)
    .join(" ");
}

function searchWithFallback(db: Database, candidates: string[], profile: KnowledgeProfile): KnowledgeContext {
  for (const candidate of candidates) {
    const query = buildSearchQuery([candidate]);

    if (!query) {
      continue;
    }

    const results = searchKnowledgeDocuments(db, query, {
      limit: profile.limit,
      sourceTypes: profile.sourceTypes,
    });
    if (results.length > 0) {
      return {
        query,
        profile: profile.name,
        sourceTypes: profile.sourceTypes,
        results,
      };
    }
  }

  return {
    query: buildSearchQuery(candidates),
    profile: profile.name,
    sourceTypes: profile.sourceTypes,
    results: [],
  };
}
