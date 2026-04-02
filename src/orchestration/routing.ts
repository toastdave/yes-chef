import type { ResolvedAgentConfig } from "../core/agents.ts";
import type { BackendCapabilities } from "../core/backends.ts";
import { describeBackendCapabilities, resolveBackendForTask } from "../core/backends.ts";
import type { OverlayConfig, PackConfig, SkillConfig, YesChefConfig } from "../core/config.ts";
import type { MenuRecord, OrderRecord } from "../core/models.ts";
import { inferKnowledgeSignals, type KnowledgeContext } from "../knowledge/context.ts";

export interface ResolvedRouting {
  backend: string;
  backendReason: string;
  backendCapabilities: BackendCapabilities;
  skills: string[];
  packs: string[];
  validationsRequired: string[];
  tools: Record<string, unknown>;
  permissions: Record<string, unknown>;
  routingReasons: string[];
  knowledgeSources: string[];
  overlayContext: {
    repoMap: string[];
    architectureNotes: string[];
    commands: Record<string, string>;
    dangerousPaths: string[];
    matchedDangerousPaths: string[];
    acceptanceCriteria: string[];
  };
}

export interface ResolvedPackBinding {
  id: string;
  description: string | null;
  env: Record<string, string>;
  skills: string[];
  validations: string[];
  validationCommands: Record<string, string>;
}

export function resolveOrderRouting(options: {
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  agent: ResolvedAgentConfig;
  knowledge?: KnowledgeContext;
  observedCapabilities?: Record<string, BackendCapabilities>;
}): ResolvedRouting {
  const skillSet = new Set<string>([...options.order.skills, ...options.agent.skills]);
  const packSet = new Set<string>([...options.order.packs, ...options.agent.packs]);
  const validationSet = new Set<string>(options.order.validationsRequired);
  const routingReasons: string[] = [];
  const tools = deepMerge({}, options.order.tools);
  deepMerge(tools, options.agent.tools);
  const permissions = deepMerge({}, options.order.permissions);
  deepMerge(permissions, options.agent.permissions);
  const knowledgeSignals = inferKnowledgeSignals(options.knowledge ?? { profile: "none", query: "", sourceTypes: [], results: [] });
  const knowledgeSources = options.knowledge?.results.map((result) => result.path) ?? [];
  const textSignals = `${options.menu.objective} ${options.order.title}`.toLowerCase();
  const uiSignals = /(ui|frontend|browser|page|screen|component|design)/.test(textSignals);
  const overlayContext = buildOverlayContext(options.config.overlays, textSignals, knowledgeSources);

  for (const skill of options.config.routing.roleSkills[options.order.role] ?? []) {
    if (!skillSet.has(skill)) {
      skillSet.add(skill);
      routingReasons.push(`role:${options.order.role} adds skill ${skill}`);
    }
  }

  for (const skill of options.config.routing.kindSkills[options.order.kind] ?? []) {
    if (!skillSet.has(skill)) {
      skillSet.add(skill);
      routingReasons.push(`kind:${options.order.kind} adds skill ${skill}`);
    }
  }

  if (options.order.isolationStrategy === "worktree" && !skillSet.has("worktree-usage")) {
    skillSet.add("worktree-usage");
    routingReasons.push("isolated worktree adds skill worktree-usage");
  }

  if (uiSignals && options.config.routing.uiPackRoles.includes(options.order.role) && options.config.packs.browser?.enabled) {
    if (!packSet.has("browser")) {
      packSet.add("browser");
      routingReasons.push(`ui signals add pack browser for role ${options.order.role}`);
    }
  }

  if (uiSignals && options.order.role === "line-cook" && !skillSet.has("frontend-design")) {
    skillSet.add("frontend-design");
    routingReasons.push("ui signals add skill frontend-design");
  }

  if ((knowledgeSignals.includes("repo-rules") || knowledgeSignals.includes("prd")) && !skillSet.has("verification-before-completion")) {
    skillSet.add("verification-before-completion");
    routingReasons.push("knowledge signals add skill verification-before-completion");
  }

  if (overlayContext.acceptanceCriteria.length > 0 && !skillSet.has("verification-before-completion")) {
    skillSet.add("verification-before-completion");
    routingReasons.push("overlay acceptance criteria add skill verification-before-completion");
  }

  if (overlayContext.matchedDangerousPaths.length > 0) {
    if (!skillSet.has("architecture-review")) {
      skillSet.add("architecture-review");
    }
    routingReasons.push(`dangerous paths matched: ${overlayContext.matchedDangerousPaths.join(", ")}`);
  }

  if ((overlayContext.repoMap.length > 0 || overlayContext.architectureNotes.length > 0) && options.order.role === "critic") {
    routingReasons.push("overlay repo map and architecture notes inform critic review");
  }

  for (const packId of [...packSet]) {
    const pack = options.config.packs[packId];
    if (!pack || pack.enabled === false) {
      packSet.delete(packId);
      continue;
    }

    applyPack(packId, pack, skillSet, validationSet, tools, permissions, routingReasons);
  }

  const configuredSkills = [...skillSet].filter((skillId) => Boolean(options.config.skills[skillId]));
  for (const skillId of configuredSkills) {
    const skill = options.config.skills[skillId];
    applySkill(skillId, skill, tools, routingReasons);
  }

  const requiredTools = Object.entries(tools)
    .filter(([, enabled]) => enabled === true)
    .map(([tool]) => tool)
    .filter((tool) => tool !== "browser")
    .sort();
  const backendResolution = resolveBackendForTask(
    options.config,
    options.agent.backendPreference,
    options.agent.model,
    {
      mode: options.order.mode,
      browser: uiSignals && [...packSet].includes("browser"),
      write: isWriteOrderKind(options.order.kind),
      requiredTools,
      backendAgent: options.order.backendAgent,
    },
    options.observedCapabilities,
  );

  routingReasons.push(`backend:${backendResolution.backend} capabilities ${describeBackendCapabilities(backendResolution.capabilities)}`);

  if (backendResolution.backend !== options.agent.backend) {
    routingReasons.push(`backend rerouted from ${options.agent.backend} to ${backendResolution.backend}`);
  }

  routingReasons.push(`backend decision: ${backendResolution.reason}`);

  if (!backendResolution.requirementsMatched) {
    routingReasons.push(`backend:${backendResolution.backend} does not satisfy all requested task capabilities`);
  }

  if (backendResolution.requirements.browser && !backendResolution.capabilities.browser) {
    routingReasons.push(`backend:${backendResolution.backend} lacks native browser support; UI verification relies on shell validations or pack-specific harnesses`);
  }

  return {
    backend: backendResolution.backend,
    backendReason: backendResolution.reason,
    backendCapabilities: backendResolution.capabilities,
    skills: configuredSkills,
    packs: [...packSet],
    validationsRequired: [...validationSet],
    tools,
    permissions,
    routingReasons,
    knowledgeSources,
    overlayContext,
  };
}

function buildOverlayContext(overlays: OverlayConfig, textSignals: string, knowledgeSources: string[]) {
  const matchedDangerousPaths = overlays.dangerousPaths.filter((dangerousPath) => pathMatchesSignals(dangerousPath, textSignals, knowledgeSources));

  return {
    repoMap: overlays.repoMap,
    architectureNotes: overlays.architectureNotes,
    commands: overlays.commands,
    dangerousPaths: overlays.dangerousPaths,
    matchedDangerousPaths,
    acceptanceCriteria: overlays.acceptanceCriteria,
  };
}

export function resolvePackBindings(config: YesChefConfig, packIds: string[]): ResolvedPackBinding[] {
  return packIds
    .map((packId) => {
      const pack = config.packs[packId];

      if (!pack || pack.enabled === false) {
        return null;
      }

      return {
        id: packId,
        description: pack.description ?? null,
        env: pack.env ?? {},
        skills: pack.skills ?? [],
        validations: pack.validations ?? [],
        validationCommands: pack.validationCommands ?? {},
      };
    })
    .filter((binding): binding is ResolvedPackBinding => binding !== null);
}

function applyPack(
  packId: string,
  pack: PackConfig,
  skillSet: Set<string>,
  validationSet: Set<string>,
  tools: Record<string, unknown>,
  permissions: Record<string, unknown>,
  routingReasons: string[],
): void {
  for (const skill of pack.skills ?? []) {
    if (!skillSet.has(skill)) {
      skillSet.add(skill);
      routingReasons.push(`pack:${packId} adds skill ${skill}`);
    }
  }

  for (const validation of pack.validations ?? []) {
    if (!validationSet.has(validation)) {
      validationSet.add(validation);
      routingReasons.push(`pack:${packId} adds validation ${validation}`);
    }
  }

  deepMerge(tools, pack.tools ?? {});
  deepMerge(permissions, pack.permissions ?? {});
}

function applySkill(
  skillId: string,
  skill: SkillConfig,
  tools: Record<string, unknown>,
  routingReasons: string[],
): void {
  for (const tool of skill.requiredTools ?? []) {
    if (!(tool in tools)) {
      tools[tool] = true;
      routingReasons.push(`skill:${skillId} requires tool ${tool}`);
    }
  }
}

function isWriteOrderKind(kind: OrderRecord["kind"]): boolean {
  return kind === "implement" || kind === "repair" || kind === "rules-update" || kind === "merge";
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) {
      deepMerge(target[key] as Record<string, unknown>, value);
      continue;
    }

    target[key] = structuredClone(value);
  }

  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathMatchesSignals(path: string, textSignals: string, knowledgeSources: string[]): boolean {
  const normalizedPath = path.toLowerCase();

  if (knowledgeSources.some((source) => source.toLowerCase().includes(normalizedPath))) {
    return true;
  }

  const pathTokens = normalizedPath.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  return pathTokens.some((token) => textSignals.includes(token));
}
