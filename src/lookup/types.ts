import type { KnowledgeSearchResult } from "../knowledge/types.ts";

export interface LookupStateResult {
  kind: "menu" | "order" | "run" | "workspace" | "validation";
  id: string;
  title: string;
  summary: string;
  status: string;
  relatedId: string | null;
}

export interface LookupResponse {
  query: string;
  sourceTypes: string[];
  knowledge: KnowledgeSearchResult[];
  state: LookupStateResult[];
}
