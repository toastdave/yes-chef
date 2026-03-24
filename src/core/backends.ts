import { DEFAULT_OPENCODE_FREE_MODEL } from "./constants.ts";
import type { BackendConfig, YesChefConfig } from "./config.ts";
import { commandExists } from "./exec.ts";

export type ModelFamily = "gpt" | "anthropic" | "gemini" | "generic";

export interface BackendAvailability {
  id: string;
  config: BackendConfig;
  installed: boolean;
}

export interface BackendResolution {
  backend: string;
  configuredBackend: string;
  modelFamily: ModelFamily;
  chain: string[];
  fallbackUsed: boolean;
  reason: string;
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

export function resolveBackendForModel(config: YesChefConfig, configuredBackend: string | undefined, model: string): BackendResolution {
  const requested = normalizeRequestedBackend(configuredBackend);
  const family = inferModelFamily(model);
  const availability = listBackendAvailability(config);
  const availabilityById = new Map(availability.map((backend) => [backend.id, backend]));

  if (requested !== "auto") {
    return {
      backend: requested,
      configuredBackend: requested,
      modelFamily: family,
      chain: [requested],
      fallbackUsed: false,
      reason: "explicit backend configured",
    };
  }

  const chain = backendPreferenceChain(family);
  const installedEnabled = chain.find((backendId) => {
    const backend = availabilityById.get(backendId);
    return backend !== undefined && backend.config.enabled !== false && backend.installed;
  });

  if (installedEnabled) {
    return {
      backend: installedEnabled,
      configuredBackend: "auto",
      modelFamily: family,
      chain,
      fallbackUsed: installedEnabled !== chain[0],
      reason: "auto-selected installed backend for model family",
    };
  }

  const enabled = chain.find((backendId) => availabilityById.get(backendId)?.config.enabled !== false) ?? chain[0] ?? "opencode";
  return {
    backend: enabled,
    configuredBackend: "auto",
    modelFamily: family,
    chain,
    fallbackUsed: enabled !== (chain[0] ?? enabled),
    reason: "no installed backend available; using first enabled fallback",
  };
}

export function inferModelFamily(model: string): ModelFamily {
  const value = model.toLowerCase();

  if (value.includes("claude") || value.startsWith("anthropic/")) {
    return "anthropic";
  }

  if (value.includes("gemini") || value.startsWith("google/")) {
    return "gemini";
  }

  if (value.includes("gpt") || value.includes("codex") || value.startsWith("openai/") || value.startsWith("opencode/gpt")) {
    return "gpt";
  }

  return "generic";
}

export function backendPreferenceChain(family: ModelFamily): string[] {
  switch (family) {
    case "gpt":
      return ["codex", "opencode"];
    case "anthropic":
      return ["claude"];
    case "gemini":
      return ["gemini", "opencode"];
    case "generic":
    default:
      return ["opencode"];
  }
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

function normalizeRequestedBackend(configuredBackend: string | undefined): string {
  if (!configuredBackend || configuredBackend === "inherit" || configuredBackend === "auto") {
    return "auto";
  }

  return configuredBackend;
}
