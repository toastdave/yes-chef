import type { ResolvedAgentConfig } from "../core/agents.ts";
import type { PackConfig, SkillConfig, YesChefConfig } from "../core/config.ts";
import type { MenuRecord, OrderRecord } from "../core/models.ts";
import { inferKnowledgeSignals, type KnowledgeContext } from "../knowledge/context.ts";

export interface ResolvedRouting {
  skills: string[];
  packs: string[];
  validationsRequired: string[];
  tools: Record<string, unknown>;
  permissions: Record<string, unknown>;
  routingReasons: string[];
  knowledgeSources: string[];
}

export function resolveOrderRouting(options: {
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  agent: ResolvedAgentConfig;
  knowledge?: KnowledgeContext;
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
  const textSignals = `${options.menu.objective} ${options.order.title}`.toLowerCase();
  const uiSignals = /(ui|frontend|browser|page|screen|component|design)/.test(textSignals);

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

  for (const packId of [...packSet]) {
    const pack = options.config.packs[packId];
    if (!pack || pack.enabled === false) {
      packSet.delete(packId);
      continue;
    }

    applyPack(packId, pack, skillSet, validationSet, tools, permissions, routingReasons);
  }

  const configuredSkills = [...skillSet].filter((skillId) => Boolean(options.config.skills[skillId]));
  const knowledgeSources = options.knowledge?.results.map((result) => result.path) ?? [];

  for (const skillId of configuredSkills) {
    const skill = options.config.skills[skillId];
    applySkill(skillId, skill, tools, routingReasons);
  }

  return {
    skills: configuredSkills,
    packs: [...packSet],
    validationsRequired: [...validationSet],
    tools,
    permissions,
    routingReasons,
    knowledgeSources,
  };
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
