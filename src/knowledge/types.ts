export interface KnowledgeDocumentRecord {
  id: string;
  path: string;
  sourceType: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  contentHash: string;
  updatedAt: string;
  indexedAt: string;
}

export interface KnowledgeSearchResult {
  id: string;
  path: string;
  sourceType: string;
  title: string;
  snippet: string;
  rank: number;
  updatedAt: string;
}

export interface KnowledgeSearchOptions {
  limit?: number;
  sourceTypes?: string[];
}

export interface KnowledgeIndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  total: number;
}
