import { listResolvedAgents, resolveAgent, resolveAgentIdForRole } from "../../core/agents.ts";
import { listBackendAvailability } from "../../core/backends.ts";
import { loadConfigWithMeta } from "../../core/config.ts";
import { ensureRuntimePaths } from "../../core/fs.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { daemonUrl } from "../client.ts";

export async function runDoctorCommand(): Promise<void> {
  const loaded = await loadConfigWithMeta();
  const { config, sources } = loaded;
  const runtimePaths = await ensureRuntimePaths();
  await migrateDatabase();
  const backends = listBackendAvailability(config);
  const defaultAgent = resolveAgent(config, config.defaults.agent);
  const roleLines = Object.keys(config.roleDefaults)
    .map((role) => role as keyof typeof config.roleDefaults)
    .map((role) => {
      const agentId = resolveAgentIdForRole(config, role);
      const agent = resolveAgent(config, agentId);
      return `${role} -> ${agent.id} (${agent.backend}, ${agent.model})`;
    });

  console.log("Yes Chef - Doctor");
  console.log(`ok      config             ${config.project.name}`);
  console.log(`ok      runtime            ${runtimePaths.runtimeRoot}`);
  console.log(`ok      database           ${runtimePaths.dbPath}`);
  console.log(`ok      sources            ${sources.map((source) => `${source.kind}:${source.path}`).join(" -> ")}`);
  console.log(`ok      default-agent      ${defaultAgent.id} (${defaultAgent.backend}, ${defaultAgent.model})`);

  for (const backend of backends) {
    const status = backend.installed ? (backend.config.enabled === false ? "disabled" : "ok") : backend.config.enabled === false ? "disabled" : "missing";
    console.log(`${status.padEnd(7)} backend:${backend.id.padEnd(10)} ${backend.config.command}`);
  }

  for (const roleLine of roleLines) {
    console.log(`ok      role-default       ${roleLine}`);
  }

  console.log(`${(await pingDaemon()).padEnd(7)} daemon             ${daemonUrl()}`);
  console.log(`ok      agents             ${listResolvedAgents(config).length} configured`);
}

async function pingDaemon(): Promise<string> {
  try {
    const response = await fetch(`${daemonUrl()}/status`);
    return response.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}
