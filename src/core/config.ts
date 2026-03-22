import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CONFIG_FILE_NAME } from "./constants.ts";
import type { RoleName } from "./models.ts";

export interface BackendConfig {
  command: string;
  args: string[];
}

export interface RoleConfig {
  backend: string;
  model: string;
  promptTemplate: string;
}

export interface ModeConfig {
  maxRetries: number;
  requireReview: boolean;
  requireBrowserForUi: boolean;
}

export interface YesChefConfig {
  project: {
    name: string;
    baseBranch: string;
  };
  defaults: {
    backend: string;
    mode: string;
    profile: string;
  };
  backends: Record<string, BackendConfig>;
  roles: Record<RoleName, RoleConfig>;
  modes: Record<string, ModeConfig>;
  validations: Record<string, string>;
  packs: Record<string, { enabled: boolean }>;
  ui: {
    theme: string;
    streamMode: string;
  };
}

const defaultConfig: YesChefConfig = {
  project: {
    name: "yes-chef",
    baseBranch: "main",
  },
  defaults: {
    backend: "codex",
    mode: "safe",
    profile: "default",
  },
  backends: {
    codex: { command: "codex", args: [] },
  },
  roles: {
    chef: { backend: "codex", model: "reasoning", promptTemplate: "chef" },
    "sous-chef": { backend: "codex", model: "reasoning", promptTemplate: "planner" },
    "line-cook": { backend: "codex", model: "coding", promptTemplate: "implementer" },
    expo: { backend: "codex", model: "reasoning", promptTemplate: "validator" },
    critic: { backend: "codex", model: "reasoning", promptTemplate: "reviewer" },
  },
  modes: {
    safe: { maxRetries: 2, requireReview: true, requireBrowserForUi: false },
  },
  validations: {
    typecheck: "bun run typecheck",
  },
  packs: {
    browser: { enabled: false },
  },
  ui: {
    theme: "yes-chef",
    streamMode: "events",
  },
};

export async function loadConfig(root = process.cwd()): Promise<YesChefConfig> {
  const filePath = join(root, CONFIG_FILE_NAME);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) as Partial<YesChefConfig>;

  return {
    ...defaultConfig,
    ...parsed,
    project: { ...defaultConfig.project, ...parsed.project },
    defaults: { ...defaultConfig.defaults, ...parsed.defaults },
    backends: { ...defaultConfig.backends, ...parsed.backends },
    roles: { ...defaultConfig.roles, ...parsed.roles },
    modes: { ...defaultConfig.modes, ...parsed.modes },
    validations: { ...defaultConfig.validations, ...parsed.validations },
    packs: { ...defaultConfig.packs, ...parsed.packs },
    ui: { ...defaultConfig.ui, ...parsed.ui },
  };
}

export function resolveRoleConfig(config: YesChefConfig, role: RoleName): RoleConfig {
  return config.roles[role];
}

export function resolveBackendConfig(config: YesChefConfig, backendName: string): BackendConfig {
  const backend = config.backends[backendName];

  if (!backend) {
    throw new Error(`Unknown backend: ${backendName}`);
  }

  return backend;
}

function stripJsonCommentsAndTrailingCommas(value: string): string {
  const withoutComments = value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");

  return withoutComments.replace(/,\s*([}\]])/g, "$1");
}
