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
    const query = (subcommand === "search" ? rest : args).join(" ").trim();

    if (!query) {
      throw new Error("Usage: yeschef knowledge search <query>");
    }

    const response = await daemonRequest<SearchResponse>(`/knowledge/search?q=${encodeURIComponent(query)}`);
    console.log(`Knowledge results for: ${response.query}`);

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
