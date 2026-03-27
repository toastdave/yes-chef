import type { LookupResponse } from "../../lookup/types.ts";
import { daemonRequest } from "../client.ts";

export async function runLookupCommand(args: string[]): Promise<void> {
  const { query, sourceTypes } = parseLookupArgs(args);

  if (!query) {
    throw new Error("Usage: yeschef lookup <query> [--source <type>]");
  }

  const params = new URLSearchParams({ q: query });
  for (const sourceType of sourceTypes) {
    params.append("sourceType", sourceType);
  }

  const response = await daemonRequest<LookupResponse>(`/lookup?${params.toString()}`);
  console.log(`Lookup for: ${response.query}`);

  if (response.sourceTypes.length > 0) {
    console.log(`Knowledge sources: ${response.sourceTypes.join(", ")}`);
  }

  if (response.state.length === 0 && response.knowledge.length === 0) {
    console.log("No matching state or knowledge found.");
    return;
  }

  if (response.state.length > 0) {
    console.log("State:");
    for (const result of response.state) {
      console.log(`- ${result.kind} ${result.id} ${result.title}`);
      console.log(`  ${result.summary} [${result.status}]${result.relatedId ? ` -> ${result.relatedId}` : ""}`);
    }
  }

  if (response.knowledge.length > 0) {
    console.log("Knowledge:");
    for (const result of response.knowledge) {
      console.log(`- ${result.title} [${result.sourceType}] ${result.path}`);
      console.log(`  ${result.snippet}`);
    }
  }
}

function parseLookupArgs(args: string[]): { query: string; sourceTypes: string[] } {
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
