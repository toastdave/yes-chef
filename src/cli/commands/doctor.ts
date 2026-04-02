import { listResolvedAgents, resolveAgent, resolveAgentForRole } from "../../core/agents.ts";
import { getObservedBackendCapabilities, listBackendCapabilityObservations } from "../../core/backend-observations.ts";
import { describeBackendCapabilities, listBackendAvailability } from "../../core/backends.ts";
import { loadConfigWithMeta } from "../../core/config.ts";
import { ensureRuntimePaths } from "../../core/fs.ts";
import { getDatabase } from "../../db/client.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { countKnowledgeDocuments } from "../../knowledge/search.ts";
import { daemonUrl } from "../client.ts";

export async function runDoctorCommand(): Promise<void> {
  const loaded = await loadConfigWithMeta();
  const { config, sources } = loaded;
  const runtimePaths = await ensureRuntimePaths();
  await migrateDatabase();
  const db = getDatabase();
  const backends = listBackendAvailability(config);
  const observedCapabilities = getObservedBackendCapabilities(db, config);
  const observations = new Map(listBackendCapabilityObservations(db).map((observation) => [observation.backendId, observation]));
  const defaultAgent = resolveAgent(config, config.defaults.agent);
  const roleLines = Object.keys(config.roleDefaults)
    .map((role) => role as keyof typeof config.roleDefaults)
    .map((role) => {
      const agent = resolveAgentForRole(config, role);
      const preference = agent.backendPreference === agent.backend ? agent.backend : `${agent.backendPreference} -> ${agent.backend}`;
      const delegate = agent.backendAgent ? `:${agent.backendAgent}` : "";
      const capabilities = observedCapabilities[agent.backend] ?? agent.backendCapabilities;
      return `${role} -> ${agent.id} (${preference}${delegate}, ${agent.model}, ${agent.mode}, caps:${describeBackendCapabilities(capabilities)})`;
    });

  console.log("Yes Chef - Doctor");
  console.log(`ok      config             ${config.project.name}`);
  console.log(`ok      runtime            ${runtimePaths.runtimeRoot}`);
  console.log(`ok      database           ${runtimePaths.dbPath}`);
  console.log(`ok      sources            ${sources.map((source) => `${source.kind}:${source.path}`).join(" -> ")}`);
  const defaultPreference =
    defaultAgent.backendPreference === defaultAgent.backend ? defaultAgent.backend : `${defaultAgent.backendPreference} -> ${defaultAgent.backend}`;
  const defaultCapabilities = observedCapabilities[defaultAgent.backend] ?? defaultAgent.backendCapabilities;
  console.log(
    `ok      default-agent      ${defaultAgent.id} (${defaultPreference}, ${defaultAgent.model}, ${defaultAgent.mode}, caps:${describeBackendCapabilities(defaultCapabilities)})`,
  );

  for (const backend of backends) {
    const status = backend.installed ? (backend.config.enabled === false ? "disabled" : "ok") : backend.config.enabled === false ? "disabled" : "missing";
    const observed = observedCapabilities[backend.id];
    const observedSuffix = observations.has(backend.id)
      ? ` observed:${describeBackendCapabilities(observed)} runs=${observations.get(backend.id)!.sampleCount}`
      : "";
    console.log(`${status.padEnd(7)} backend:${backend.id.padEnd(10)} ${backend.config.command} (${describeBackendCapabilities(backend.capabilities)})${observedSuffix}`);
  }

  for (const roleLine of roleLines) {
    console.log(`ok      role-default       ${roleLine}`);
  }

  console.log(`${(await pingDaemon()).padEnd(7)} daemon             ${daemonUrl()}`);
  console.log(`ok      agents             ${listResolvedAgents(config).length} configured`);
  console.log(`ok      knowledge          ${countKnowledgeDocuments(db)} indexed docs`);
}

async function pingDaemon(): Promise<string> {
  try {
    const response = await fetch(`${daemonUrl()}/status`);
    return response.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}
