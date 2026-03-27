import type { Database } from "bun:sqlite";

import type { KnowledgeSearchResult } from "./types.ts";

interface SearchRow {
  id: string;
  path: string;
  source_type: string;
  title: string;
  snippet: string;
  rank: number;
  updated_at: string;
}

export function searchKnowledgeDocuments(db: Database, query: string, limit = 10): KnowledgeSearchResult[] {
  const expression = buildMatchExpression(query);

  if (!expression) {
    return [];
  }

  const rows = db
    .query(
      `SELECT
        kd.id,
        kd.path,
        kd.source_type,
        kd.title,
        snippet(knowledge_documents_fts, 1, '[', ']', '...', 12) AS snippet,
        bm25(knowledge_documents_fts) AS rank,
        kd.updated_at
      FROM knowledge_documents_fts
      JOIN knowledge_documents kd ON kd.rowid = knowledge_documents_fts.rowid
      WHERE knowledge_documents_fts MATCH ?
      ORDER BY rank ASC
      LIMIT ?`,
    )
    .all(expression, limit) as SearchRow[];

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    sourceType: row.source_type,
    title: row.title,
    snippet: row.snippet,
    rank: row.rank,
    updatedAt: row.updated_at,
  }));
}

export function countKnowledgeDocuments(db: Database): number {
  const row = db.query(`SELECT COUNT(*) AS count FROM knowledge_documents`).get() as { count: number };
  return row?.count ?? 0;
}

function buildMatchExpression(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replaceAll('"', ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return "";
  }

  return tokens.map((token) => `"${token}"*`).join(" AND ");
}
