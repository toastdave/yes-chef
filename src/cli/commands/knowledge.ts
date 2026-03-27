import { daemonRequest } from "../client.ts";

interface IndexResponse {
  indexed: number;
  skipped: number;
  removed: number;
  total: number;
  indexedDocuments: number;
}

interface SearchResponse {
  query: string;
  sourceTypes: string[];
  results: Array<{
    id: string;
    path: string;
    sourceType: string;
    title: string;
    snippet: string;
    rank: number;
    updatedAt: string;
  }>;
}

export async function runKnowledgeCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "search") {
    const queryArgs = subcommand === "search" ? rest : args;
    const { query, sourceTypes } = parseKnowledgeSearchArgs(queryArgs);

    if (!query) {
      throw new Error("Usage: yeschef knowledge search <query>");
    }

    const searchParams = new URLSearchParams({ q: query });
    for (const sourceType of sourceTypes) {
      searchParams.append("sourceType", sourceType);
    }

    const response = await daemonRequest<SearchResponse>(`/knowledge/search?${searchParams.toString()}`);
    console.log(`Knowledge results for: ${response.query}`);
    if (response.sourceTypes.length > 0) {
      console.log(`Sources: ${response.sourceTypes.join(", ")}`);
    }

    if (response.results.length === 0) {
      console.log("No indexed knowledge matched.");
      return;
    }

    for (const result of response.results) {
      console.log(`- ${result.title} [${result.sourceType}] ${result.path}`);
      console.log(`  ${result.snippet}`);
    }

    return;
  }

  if (subcommand === "index") {
    const response = await daemonRequest<IndexResponse>("/knowledge/index", { method: "POST" });
    console.log(`Indexed knowledge documents: ${response.indexedDocuments}`);
    console.log(`Updated: ${response.indexed}, skipped: ${response.skipped}, removed: ${response.removed}, total scanned: ${response.total}`);
    return;
  }

  throw new Error("Usage: yeschef knowledge index | yeschef knowledge search <query>");
}

function parseKnowledgeSearchArgs(args: string[]): { query: string; sourceTypes: string[] } {
  const queryParts: string[] = [];
  const sourceTypes: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--source" || arg === "-s") {
      const value = args[index + 1];
      if (value) {
        sourceTypes.push(value);
        index += 1;
      }
      continue;
    }

    queryParts.push(arg);
  }

  return {
    query: queryParts.join(" ").trim(),
    sourceTypes,
  };
}
