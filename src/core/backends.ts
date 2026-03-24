import { DEFAULT_OPENCODE_FREE_MODEL } from "./constants.ts";
import type { BackendConfig, YesChefConfig } from "./config.ts";
import { commandExists } from "./exec.ts";

export interface BackendAvailability {
  id: string;
  config: BackendConfig;
  installed: boolean;
}

export function listBackendAvailability(config: YesChefConfig): BackendAvailability[] {
  return Object.entries(config.backends)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, backend]) => ({
      id,
      config: backend,
      installed: commandExists(backend.command),
    }));
}

export function installedBackendIds(config: YesChefConfig): string[] {
  return listBackendAvailability(config)
    .filter((backend) => backend.installed)
    .map((backend) => backend.id);
}

export function recommendedModelForBackend(backendId: string): string {
  switch (backendId) {
    case "codex":
      return "gpt-5-codex";
    case "claude":
      return "claude-sonnet-4-5";
    case "gemini":
      return "gemini-3.1-pro";
    case "opencode":
    default:
      return DEFAULT_OPENCODE_FREE_MODEL;
  }
}
