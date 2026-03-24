import type { AgentConfig, YesChefConfig } from "./config.ts";
import type { RoleName } from "./models.ts";

export const builtinRoleDefaults: Record<RoleName, string> = {
  chef: "chef",
  "sous-chef": "sous-chef",
  "line-cook": "line-cook",
  expo: "expo",
  critic: "critic",
};

export const builtinAgents: Record<string, AgentConfig> = {
  chef: {
    role: "chef",
    description: "Owns orchestration, menu revisions, and final service decisions.",
    prompt: "chef",
    mode: "managed",
  },
  "sous-chef": {
    role: "sous-chef",
    description: "Plans scope, acceptance criteria, and tonight's menu.",
    prompt: "planner",
    mode: "managed",
  },
  "line-cook": {
    role: "line-cook",
    description: "Implements scoped code changes for an order.",
    prompt: "implementer",
    mode: "managed",
  },
  expo: {
    role: "expo",
    description: "Runs deterministic validation gates and reports pass or fail.",
    prompt: "validator",
    mode: "managed",
  },
  critic: {
    role: "critic",
    description: "Reviews diffs and architecture fit before the pass.",
    prompt: "reviewer",
    mode: "managed",
  },
};

export interface ResolvedAgentConfig extends AgentConfig {
  id: string;
  backend: string;
  model: string;
  prompt: string;
}

export function resolveAgentIdForRole(config: YesChefConfig, role: RoleName): string {
  return config.roleDefaults[role] ?? builtinRoleDefaults[role];
}

export function resolveAgent(config: YesChefConfig, agentId: string): ResolvedAgentConfig {
  const builtin = builtinAgents[agentId];
  const configured = config.agents[agentId];

  if (!builtin && !configured) {
    throw new Error(`Unknown Yes Chef agent: ${agentId}`);
  }

  const merged: AgentConfig = {
    ...(builtin ?? {}),
    ...(configured ?? {}),
  };

  if (!merged.role) {
    throw new Error(`Agent ${agentId} is missing a role`);
  }

  return {
    ...merged,
    id: agentId,
    backend: inheritedValue(merged.backend, config.defaults.backend),
    model: inheritedValue(merged.model, config.defaults.model),
    prompt: inheritedValue(merged.prompt, merged.role),
  };
}

export function listResolvedAgents(config: YesChefConfig): ResolvedAgentConfig[] {
  const agentIds = new Set([...Object.keys(builtinAgents), ...Object.keys(config.agents)]);
  return [...agentIds].sort().map((agentId) => resolveAgent(config, agentId));
}

function inheritedValue(value: string | undefined, fallback: string): string {
  if (!value || value === "inherit") {
    return fallback;
  }

  return value;
}
