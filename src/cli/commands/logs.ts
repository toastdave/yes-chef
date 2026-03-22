import { daemonRequest } from "../client.ts";

interface RunResponse {
  id: string;
  summary: string | null;
  artifact_ids_json: string;
}

export async function runLogsCommand(args: string[]): Promise<void> {
  const runId = args[0];

  if (!runId) {
    throw new Error("Usage: yeschef logs <run-id>");
  }

  const run = await daemonRequest<RunResponse>(`/runs/${runId}`);
  console.log(`Run ${run.id}`);
  console.log(run.summary ?? "No summary recorded.");

  const artifactIds = JSON.parse(run.artifact_ids_json) as string[];
  if (artifactIds.length === 0) {
    console.log("No artifacts recorded.");
    return;
  }

  console.log(`Artifact IDs: ${artifactIds.join(", ")}`);
  console.log("Inspect `.yeschef/db/yeschef.sqlite` or `.yeschef/artifacts/` for stored logs.");
}
