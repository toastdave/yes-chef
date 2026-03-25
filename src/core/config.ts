import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import {
  CONFIG_FILE_NAME,
  CONFIG_OVERRIDE_ENV_VAR,
  CONFIG_SCHEMA_URL,
  GLOBAL_CONFIG_DIR_NAME,
  GLOBAL_CONFIG_ENV_VAR,
} from "./constants.ts";
import type { RoleName } from "./models.ts";

export interface BackendConfig {
  command: string;
  args: string[];
  managedArgs?: string[];
  delegateArgs?: string[];
  enabled?: boolean;
  installHint?: string;
}

export interface AgentConfig {
  role: RoleName;
  description?: string;
  backend?: string;
  model?: string;
  prompt?: string;
  tools?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  backendAgent?: string;
  mode?: "managed" | "delegate";
}

interface LegacyRoleConfig {
  backend: string;
  model: string;
  promptTemplate: string;
}

interface ConfigLayerInput extends Partial<YesChefConfig> {
  roles?: Partial<Record<RoleName, LegacyRoleConfig>>;
}

export interface ModeConfig {
  maxRetries: number;
  requireReview: boolean;
  requireBrowserForUi: boolean;
}

export interface PoliciesConfig {
  worktrees: {
    mode: "off" | "auto" | "required";
    cleanup: "keep" | "delete";
    keepFailed: boolean;
  };
  completion: {
    requireValidations: boolean;
    conventionalCommits: boolean;
  };
  riskyPaths: string[];
}

export interface YesChefConfig {
  $schema?: string;
  project: {
    name: string;
    baseBranch: string;
  };
  defaults: {
    backend: string;
    model: string;
    mode: string;
    profile: string;
    agent: string;
  };
  backends: Record<string, BackendConfig>;
  agents: Record<string, AgentConfig>;
  roleDefaults: Record<RoleName, string>;
  modes: Record<string, ModeConfig>;
  policies: PoliciesConfig;
  validations: Record<string, string>;
  packs: Record<string, { enabled: boolean }>;
  ui: {
    theme: string;
    streamMode: string;
  };
}

export interface ConfigSource {
  kind: "builtin" | "global" | "override" | "project";
  path: string;
}

export interface LoadedConfig {
  config: YesChefConfig;
  sources: ConfigSource[];
}

const defaultRoleDefaults: Record<RoleName, string> = {
  chef: "chef",
  "sous-chef": "sous-chef",
  "line-cook": "line-cook",
  expo: "expo",
  critic: "critic",
};

const builtinBackends: Record<string, BackendConfig> = {
  codex: {
    command: "codex",
    args: [],
    enabled: true,
  },
  opencode: {
    command: "opencode",
    args: [],
    enabled: true,
    installHint: "curl -fsSL https://opencode.ai/install | bash",
  },
  claude: {
    command: "claude",
    args: [],
    enabled: true,
  },
  gemini: {
    command: "gemini",
    args: [],
    enabled: true,
  },
};

function createDefaultConfig(root: string): YesChefConfig {
  return {
    $schema: CONFIG_SCHEMA_URL,
    project: {
      name: basename(root),
      baseBranch: "main",
    },
    defaults: {
      backend: "auto",
      model: "gpt-5-codex",
      mode: "safe",
      profile: "default",
      agent: "line-cook",
    },
    backends: structuredClone(builtinBackends),
    agents: {
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
    },
    roleDefaults: { ...defaultRoleDefaults },
    modes: {
      safe: { maxRetries: 2, requireReview: true, requireBrowserForUi: false },
    },
    policies: {
      worktrees: {
        mode: "auto",
        cleanup: "delete",
        keepFailed: true,
      },
      completion: {
        requireValidations: true,
        conventionalCommits: false,
      },
      riskyPaths: [],
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
}

export async function loadConfig(root = process.cwd()): Promise<YesChefConfig> {
  const loaded = await loadConfigWithMeta(root);
  return loaded.config;
}

export async function loadConfigWithMeta(root = process.cwd()): Promise<LoadedConfig> {
  const resolvedRoot = resolve(root);
  const config = createDefaultConfig(resolvedRoot);
  const sources: ConfigSource[] = [{ kind: "builtin", path: "defaults" }];
  const paths = await getConfigPaths(resolvedRoot);

  for (const source of paths) {
    const layer = await maybeReadConfigLayer(source.path);

    if (!layer) {
      continue;
    }

    mergeInto(config as unknown as Record<string, unknown>, layer as Record<string, unknown>);
    sources.push(source);
  }

  return { config, sources };
}

export function resolveAgentConfig(config: YesChefConfig, agentId: string): AgentConfig {
  const agent = config.agents[agentId];

  if (!agent) {
    throw new Error(`Unknown Yes Chef agent: ${agentId}`);
  }

  return agent;
}

export function resolveBackendConfig(config: YesChefConfig, backendName: string): BackendConfig {
  const backend = config.backends[backendName];

  if (!backend) {
    throw new Error(`Unknown backend: ${backendName}`);
  }

  return backend;
}

export function globalConfigPath(): string {
  return process.env[GLOBAL_CONFIG_ENV_VAR] ?? join(homedir(), ".config", GLOBAL_CONFIG_DIR_NAME, "config.jsonc");
}

export async function findProjectConfigPath(startDir = process.cwd()): Promise<string | null> {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, CONFIG_FILE_NAME);

    if (await fileExists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function stringifyConfig(config: Partial<YesChefConfig>): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function loadConfigFile(filePath: string): Promise<Partial<YesChefConfig> | null> {
  return maybeReadConfigLayer(filePath);
}

async function getConfigPaths(root: string): Promise<ConfigSource[]> {
  const sources: ConfigSource[] = [];
  const globalPath = globalConfigPath();
  const overridePath = process.env[CONFIG_OVERRIDE_ENV_VAR];
  const projectPath = await findProjectConfigPath(root);

  if (await fileExists(globalPath)) {
    sources.push({ kind: "global", path: globalPath });
  }

  if (overridePath && (await fileExists(overridePath))) {
    sources.push({ kind: "override", path: overridePath });
  }

  if (projectPath) {
    sources.push({ kind: "project", path: projectPath });
  }

  return sources;
}

async function maybeReadConfigLayer(filePath: string): Promise<Partial<YesChefConfig> | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) as ConfigLayerInput;
  return normalizeConfigLayer(parsed);
}

function normalizeConfigLayer(parsed: ConfigLayerInput): Partial<YesChefConfig> {
  const layer: Partial<YesChefConfig> = { ...parsed };

  if (parsed.roles) {
    layer.agents = { ...(layer.agents ?? {}) };

    for (const [role, roleConfig] of Object.entries(parsed.roles) as [RoleName, LegacyRoleConfig][]) {
      layer.agents[role] = {
        ...(layer.agents[role] ?? {}),
        role,
        backend: roleConfig.backend,
        model: roleConfig.model,
        prompt: roleConfig.promptTemplate,
      };
    }

    layer.roleDefaults = { ...defaultRoleDefaults, ...(layer.roleDefaults ?? {}) };
  }

  delete (layer as ConfigLayerInput).roles;
  return layer;
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    const current = target[key];

    if (isPlainObject(current) && isPlainObject(value)) {
      mergeInto(current, value);
      continue;
    }

    target[key] = cloneValue(value);
  }
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      copy[key] = cloneValue(nested);
    }
    return copy;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stripJsonCommentsAndTrailingCommas(value: string): string {
  const withoutComments = value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");

  return withoutComments.replace(/,\s*([}\]])/g, "$1");
}
