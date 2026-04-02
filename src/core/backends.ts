import { DEFAULT_OPENCODE_FREE_MODEL } from "./constants.ts";
import type { BackendCapabilityConfig, BackendConfig, YesChefConfig } from "./config.ts";
import { commandExists } from "./exec.ts";

export type ModelFamily = "gpt" | "anthropic" | "gemini" | "generic";
export type BackendPatchingMode = "none" | "patch" | "edit";

export interface BackendCapabilities {
  managed: boolean;
  delegate: boolean;
  browser: boolean;
  patching: BackendPatchingMode;
  toolSurfaces: string[];
}

export interface BackendAvailability {
  id: string;
  config: BackendConfig;
  installed: boolean;
  capabilities: BackendCapabilities;
}

export interface BackendResolution {
  backend: string;
  configuredBackend: string;
  modelFamily: ModelFamily;
  chain: string[];
  fallbackUsed: boolean;
  reason: string;
}

export interface BackendTaskRequirements {
  mode: "managed" | "delegate";
  browser: boolean;
  write: boolean;
  requiredTools: string[];
  backendAgent: string | null;
}

export interface BackendTaskResolution extends BackendResolution {
  capabilities: BackendCapabilities;
  requirements: BackendTaskRequirements;
  requirementsMatched: boolean;
}

export function listBackendAvailability(config: YesChefConfig): BackendAvailability[] {
  return Object.entries(config.backends)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, backend]) => ({
      id,
      config: backend,
      installed: commandExists(backend.command),
      capabilities: resolveBackendCapabilities(id, backend),
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

export function resolveBackendForTask(
  config: YesChefConfig,
  configuredBackend: string | undefined,
  model: string,
  requirements: BackendTaskRequirements,
): BackendTaskResolution {
  const baseResolution = resolveBackendForModel(config, configuredBackend, model);
  const availability = listBackendAvailability(config);
  const availabilityById = new Map(availability.map((backend) => [backend.id, backend]));
  const baseAvailability = availabilityById.get(baseResolution.backend);
  const baseCapabilities = baseAvailability?.capabilities ?? resolveBackendCapabilities(baseResolution.backend, config.backends[baseResolution.backend]);
  const baseMatches = backendMatchesRequirements(baseCapabilities, requirements);

  if (normalizeRequestedBackend(configuredBackend) !== "auto") {
    return {
      ...baseResolution,
      capabilities: baseCapabilities,
      requirements,
      requirementsMatched: baseMatches,
      reason: baseMatches
        ? baseResolution.reason
        : `${baseResolution.reason}; explicit backend kept despite capability mismatch`,
    };
  }

  if (requirements.backendAgent) {
    return {
      ...baseResolution,
      capabilities: baseCapabilities,
      requirements,
      requirementsMatched: baseMatches,
      reason: baseMatches
        ? `${baseResolution.reason}; delegate backend pinned by backendAgent`
        : `${baseResolution.reason}; backendAgent prevents automatic rerouting`,
    };
  }

  const candidates = uniqueBackendIds([
    ...baseResolution.chain,
    ...availability.map((backend) => backend.id),
  ]);
  const matchingCandidate = candidates
    .map((backendId) => availabilityById.get(backendId))
    .find(
      (backend): backend is BackendAvailability =>
        backend !== undefined
        && backend.config.enabled !== false
        && backend.installed
        && backendMatchesRequirements(backend.capabilities, requirements),
    );

  if (!matchingCandidate) {
    return {
      ...baseResolution,
      capabilities: baseCapabilities,
      requirements,
      requirementsMatched: baseMatches,
      reason: baseMatches
        ? `${baseResolution.reason}; current backend already satisfies task requirements`
        : `${baseResolution.reason}; no installed backend satisfied task requirements`,
    };
  }

  if (matchingCandidate.id === baseResolution.backend) {
    return {
      ...baseResolution,
      capabilities: matchingCandidate.capabilities,
      requirements,
      requirementsMatched: true,
      reason: `${baseResolution.reason}; current backend satisfies task requirements`,
    };
  }

  return {
    ...baseResolution,
    backend: matchingCandidate.id,
    fallbackUsed: true,
    capabilities: matchingCandidate.capabilities,
    requirements,
    requirementsMatched: true,
    reason: `auto-routed to ${matchingCandidate.id} for task requirements`,
  };
}

export function resolveBackendCapabilities(backendId: string, backend: BackendConfig): BackendCapabilities {
  const defaults = defaultCapabilitiesForBackend(backendId);
  const configured = backend.capabilities ?? {};

  return {
    managed: configured.managed ?? defaults.managed ?? true,
    delegate: configured.delegate ?? defaults.delegate ?? backend.delegateArgs !== undefined,
    browser: configured.browser ?? defaults.browser ?? false,
    patching: configured.patching ?? defaults.patching ?? "edit",
    toolSurfaces: normalizeToolSurfaces(configured.toolSurfaces ?? defaults.toolSurfaces ?? []),
  };
}

export function describeBackendCapabilities(capabilities: BackendCapabilities): string {
  const parts = [
    capabilities.managed ? "managed" : "no-managed",
    capabilities.delegate ? "delegate" : "no-delegate",
    capabilities.browser ? "browser" : "no-browser",
    `patch=${capabilities.patching}`,
  ];

  if (capabilities.toolSurfaces.length > 0) {
    parts.push(`tools=${capabilities.toolSurfaces.join("/")}`);
  }

  return parts.join(", ");
}

function normalizeRequestedBackend(configuredBackend: string | undefined): string {
  if (!configuredBackend || configuredBackend === "inherit" || configuredBackend === "auto") {
    return "auto";
  }

  return configuredBackend;
}

function defaultCapabilitiesForBackend(backendId: string): BackendCapabilityConfig {
  switch (backendId) {
    case "codex":
      return { managed: true, delegate: false, browser: false, patching: "patch", toolSurfaces: ["read", "write", "bash"] };
    case "opencode":
      return { managed: true, delegate: true, browser: false, patching: "edit", toolSurfaces: ["read", "write", "bash"] };
    case "claude":
    case "gemini":
      return { managed: true, delegate: false, browser: false, patching: "edit", toolSurfaces: ["read", "write", "bash"] };
    default:
      return { managed: true, delegate: false, browser: false, patching: "edit", toolSurfaces: ["read", "write", "bash"] };
  }
}

function normalizeToolSurfaces(toolSurfaces: string[]): string[] {
  return [...new Set(toolSurfaces.map((tool) => tool.trim()).filter((tool) => tool.length > 0))].sort();
}

function backendMatchesRequirements(capabilities: BackendCapabilities, requirements: BackendTaskRequirements): boolean {
  if (requirements.mode === "managed" && !capabilities.managed) {
    return false;
  }

  if (requirements.mode === "delegate" && !capabilities.delegate) {
    return false;
  }

  if (requirements.browser && !capabilities.browser) {
    return false;
  }

  if (requirements.write && capabilities.patching === "none") {
    return false;
  }

  if (requirements.requiredTools.length > 0) {
    const supportedTools = new Set(capabilities.toolSurfaces);
    for (const tool of requirements.requiredTools) {
      if (!supportedTools.has(tool)) {
        return false;
      }
    }
  }

  return true;
}

function uniqueBackendIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}
