import { loadConfig } from "../../core/config.ts";
import { ensureRuntimePaths } from "../../core/fs.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { daemonUrl } from "../client.ts";

export async function runDoctorCommand(): Promise<void> {
  const config = await loadConfig();
  const runtimePaths = await ensureRuntimePaths();
  await migrateDatabase();

  const checks = [
    [`config`, "ok", config.project.name],
    [`runtime`, "ok", runtimePaths.runtimeRoot],
    [`database`, "ok", runtimePaths.dbPath],
    [`backend:${config.defaults.backend}`, resolveCommand(config.backends[config.defaults.backend]?.command), config.backends[config.defaults.backend]?.command ?? "missing"],
    [`daemon`, await pingDaemon(), daemonUrl()],
  ];

  console.log("Yes Chef - Doctor");
  for (const [label, status, detail] of checks) {
    console.log(`${status.padEnd(7)} ${label.padEnd(18)} ${detail}`);
  }
}

function resolveCommand(command?: string): string {
  if (!command) {
    return "missing";
  }

  const escaped = command.replace(/'/g, `'\\''`);
  const result = Bun.spawnSync({
    cmd: ["bash", "-lc", `command -v '${escaped}' >/dev/null 2>&1`],
    stdout: "pipe",
    stderr: "pipe",
  });

  return result.exitCode === 0 ? "ok" : "missing";
}

async function pingDaemon(): Promise<string> {
  try {
    const response = await fetch(`${daemonUrl()}/status`);
    return response.ok ? "ok" : "down";
  } catch {
    return "down";
  }
}
