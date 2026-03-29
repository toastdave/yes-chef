import type { OrderRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";

interface RunResponse {
  run: {
    id: string;
    order_id: string;
    backend: string;
    model: string;
    mode: string;
    backend_agent: string | null;
    status: string;
    summary: string | null;
    artifact_ids_json: string;
  };
  order: OrderRecord | null;
  artifacts: Array<{
    id: string;
    type: string;
    path: string;
  }>;
}

export async function runLogsCommand(args: string[]): Promise<void> {
  const runId = args[0];

  if (!runId) {
    throw new Error("Usage: yeschef logs <run-id>");
  }

  const response = await daemonRequest<RunResponse>(`/runs/${runId}`);
  const { run, order, artifacts } = response;

  console.log(`Run ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Backend: ${run.backend} (${run.model}, ${run.mode}${run.backend_agent ? `:${run.backend_agent}` : ""})`);
  console.log(run.summary ?? "No summary recorded.");

  if (order) {
    console.log(`Order: ${order.id} ${order.kind} ${order.title}`);
    console.log(`Agent: ${order.agentId}`);
    if (order.skills.length > 0) {
      console.log(`Skills: ${order.skills.join(", ")}`);
    }
    if (order.packs.length > 0) {
      console.log(`Packs: ${order.packs.join(", ")}`);
    }
    if (order.routingReasons.length > 0) {
      console.log(`Routing: ${order.routingReasons.join(" | ")}`);
    }
    if (order.repairForOrderId) {
      console.log(`Repairs: ${order.repairForOrderId} via ${order.sourceRunId ?? "unknown run"}`);
    }

    const failureContextPath = typeof order.failureContext.contextPath === "string" ? order.failureContext.contextPath : null;
    if (failureContextPath) {
      console.log(`Failure context: ${failureContextPath}`);
    }

    const knowledge = order.failureContext.knowledge as { results?: Array<{ path: string; title: string }> } | undefined;
    if (knowledge?.results && knowledge.results.length > 0) {
      console.log(`Knowledge refs: ${knowledge.results.map((result) => `${result.title} (${result.path})`).join(", ")}`);
    }

    const reviewAssessment = order.failureContext.reviewAssessment as {
      category?: string;
      severity?: string;
      guidance?: string[];
      stateMatches?: Array<{ id: string }>;
      knowledgeMatches?: string[];
    } | undefined;
    if (reviewAssessment?.category) {
      console.log(`Review assessment: ${reviewAssessment.category} (${reviewAssessment.severity ?? "unknown"})`);
      if (reviewAssessment.guidance && reviewAssessment.guidance.length > 0) {
        console.log(`Review guidance: ${reviewAssessment.guidance.join(" | ")}`);
      }
      if (reviewAssessment.stateMatches && reviewAssessment.stateMatches.length > 0) {
        console.log(`Review state refs: ${reviewAssessment.stateMatches.map((result) => result.id).join(", ")}`);
      }
      if (reviewAssessment.knowledgeMatches && reviewAssessment.knowledgeMatches.length > 0) {
        console.log(`Review knowledge refs: ${reviewAssessment.knowledgeMatches.join(", ")}`);
      }
    }

    const reviewTarget = typeof order.failureContext.reviewTargetOrderId === "string" ? order.failureContext.reviewTargetOrderId : null;
    if (reviewTarget) {
      console.log(`Review target: ${reviewTarget}`);
    }
  }

  if (artifacts.length === 0) {
    console.log("No artifacts recorded.");
    return;
  }

  console.log("Artifacts:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact.type}: ${artifact.path} (${artifact.id})`);
  }
}
