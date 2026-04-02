import type { Database } from "bun:sqlite";

import type { KnowledgeSearchOptions, KnowledgeSearchResult } from "./types.ts";

interface SearchRow {
  id: string;
  path: string;
  source_type: string;
  title: string;
  snippet: string;
  rank: number;
  updated_at: string;
}

export function searchKnowledgeDocuments(db: Database, query: string, options: KnowledgeSearchOptions = {}): KnowledgeSearchResult[] {
  const terms = tokenizeQuery(query);
  const limit = options.limit ?? 10;

  if (terms.length === 0) {
    return [];
  }

  const normalizedSourceTypes = (options.sourceTypes ?? []).filter(Boolean);
  const sourceFilterClause = normalizedSourceTypes.length > 0
    ? ` AND kd.source_type IN (${normalizedSourceTypes.map(() => "?").join(", ")})`
    : "";
  const rowsById = new Map<string, SearchRow>();

  for (const expression of buildMatchExpressions(terms)) {
    const params: Array<string | number> = [expression, ...normalizedSourceTypes, Math.max(limit * 3, 12)];
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
        ${sourceFilterClause}
        ORDER BY rank ASC
        LIMIT ?`,
      )
      .all(...params) as SearchRow[];

    for (const row of rows) {
      const existing = rowsById.get(row.id);
      if (!existing || row.rank < existing.rank) {
        rowsById.set(row.id, row);
      }
    }

    if (rowsById.size >= limit) {
      break;
    }
  }

  return [...rowsById.values()]
    .sort((left, right) => compareSearchRows(left, right, terms))
    .slice(0, limit)
    .map((row) => ({
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

function buildMatchExpressions(terms: string[]): string[] {
  const prefixed = terms.map((term) => `"${term}"*`);
  const expressions = [prefixed.join(" AND ")];

  if (terms.length > 1) {
    expressions.push(prefixed.join(" OR "));
    expressions.push(`"${terms.join(" ")}"`);
  }

  return [...new Set(expressions.filter((expression) => expression.length > 0))];
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(
    query
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9._/-]+/)
      .map((token) => token.replaceAll('"', "").trim())
      .filter((token) => token.length > 1),
  )].slice(0, 12);
}

function compareSearchRows(left: SearchRow, right: SearchRow, terms: string[]): number {
  const scoreDifference = scoreSearchRow(right, terms) - scoreSearchRow(left, terms);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  if (left.updated_at !== right.updated_at) {
    return right.updated_at.localeCompare(left.updated_at);
  }

  return left.path.localeCompare(right.path);
}

function scoreSearchRow(row: SearchRow, terms: string[]): number {
  const title = row.title.toLowerCase();
  const path = row.path.toLowerCase();
  const snippet = row.snippet.toLowerCase();
  const phrase = terms.join(" ");
  const bm25Score = row.rank < 0 ? Math.abs(row.rank) + 1 : 1 / (1 + row.rank);
  const exactPhraseBonus = phrase.length > 0 && (title.includes(phrase) || path.includes(phrase) || snippet.includes(phrase)) ? 6 : 0;
  const titleBonus = terms.reduce((total, term) => total + (title.includes(term) ? 3 : 0), 0);
  const pathBonus = terms.reduce((total, term) => total + (path.includes(term) ? 2 : 0), 0);
  const snippetBonus = terms.reduce((total, term) => total + (snippet.includes(term) ? 1 : 0), 0);

  return bm25Score + exactPhraseBonus + titleBonus + pathBonus + snippetBonus + sourceTypeWeight(row.source_type);
}

function sourceTypeWeight(sourceType: string): number {
  switch (sourceType) {
    case "repo-rules":
      return 8;
    case "prd":
      return 6;
    case "project-doc":
    case "project-config":
      return 3;
    case "agent":
    case "prompt":
      return 2;
    default:
      return 1;
  }
}
