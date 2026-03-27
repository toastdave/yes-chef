import type { Database } from "bun:sqlite";
import { join } from "node:path";

import { resolveAgentForRole, resolveAgentIdForRole } from "../core/agents.ts";
import type { YesChefConfig } from "../core/config.ts";
import { writeJsonFile, writeTextFile } from "../core/fs.ts";
import { createId } from "../core/ids.ts";
import type { CourseRecord, MenuRecord, OrderRecord } from "../core/models.ts";
import { inferKnowledgeSignals, type KnowledgeContext } from "../knowledge/context.ts";
import { parseJsonValue } from "../core/models.ts";
import { resolveWorkspacePlan } from "../workspaces/create.ts";

interface MenuRow {
  id: string;
  title: string;
  objective: string;
  context_summary: string;
  courses_json: string;
  dishes_json: string;
  orders_json: string;
  validations_json: string;
  risks_json: string;
  required_packs_json: string;
  status: MenuRecord["status"];
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface MenuBundle {
  menu: MenuRecord;
  orders: OrderRecord[];
  knowledge?: KnowledgeContext;
}

export function buildMenuBundle(goal: string, config: YesChefConfig, knowledge?: KnowledgeContext): MenuBundle {
  const now = new Date().toISOString();
  const menuId = createId("M");
  const orderId = createId("O");
  const courseId = createId("C");
  const agentId = resolveAgentIdForRole(config, "line-cook");
  const agent = resolveAgentForRole(config, "line-cook");
  const workspacePlan = resolveWorkspacePlan(config, {
    id: orderId,
    menuId,
    title: `Implement ${goal}`,
    kind: "implement",
    role: "line-cook",
    agentId,
    backend: agent.backend,
    model: agent.model,
    mode: agent.mode,
    backendAgent: agent.backendAgent,
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 0,
    failureContext: {},
    isolationStrategy: "in-place",
    isolationReason: "menu-prep default",
    profile: config.defaults.profile,
    promptTemplate: agent.prompt,
    tools: agent.tools,
    permissions: agent.permissions,
    workspaceId: null,
    dependsOn: [],
    packs: [],
    skills: [],
    validationsRequired: [],
    retryLimit: config.modes[config.defaults.mode]?.maxRetries ?? 0,
    status: "queued",
    priority: 1,
    createdAt: now,
    updatedAt: now,
  });

  const menu: MenuRecord = {
    id: menuId,
    title: titleFromGoal(goal),
    objective: goal,
    contextSummary: buildContextSummary(goal, knowledge),
    courses: [
      {
        id: courseId,
        menuId,
        title: "Foundation",
        summary: "Establish the first implementation slice for the requested goal.",
        status: "pending",
        orderIds: [orderId],
      },
    ],
    dishes: [goal],
    orders: [orderId],
    validations: Object.keys(config.validations),
    risks: buildMenuRisks(knowledge),
    requiredPacks: Object.entries(config.packs)
      .filter(([, pack]) => pack.enabled)
      .map(([name]) => name),
    status: "prepared",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  const order: OrderRecord = {
    id: orderId,
    menuId,
    title: `Implement ${goal}`,
    kind: "implement",
    role: "line-cook",
    agentId,
    backend: agent.backend,
    model: agent.model,
    mode: agent.mode,
    backendAgent: agent.backendAgent,
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 0,
    failureContext: {},
    isolationStrategy: workspacePlan.strategy,
    isolationReason: workspacePlan.reason,
    profile: config.defaults.profile,
    promptTemplate: agent.prompt,
    tools: agent.tools,
    permissions: agent.permissions,
    workspaceId: null,
    dependsOn: [],
    packs: menu.requiredPacks,
    skills: [],
    validationsRequired: menu.validations,
    retryLimit: config.modes[config.defaults.mode]?.maxRetries ?? 0,
    status: "queued",
    priority: 1,
    createdAt: now,
    updatedAt: now,
  };

  return { menu, orders: [order], knowledge };
}

export function insertMenu(db: Database, menu: MenuRecord): void {
  db.query(
    `INSERT INTO menus (
      id, title, objective, context_summary, courses_json, dishes_json, orders_json,
      validations_json, risks_json, required_packs_json, status, revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    menu.id,
    menu.title,
    menu.objective,
    menu.contextSummary,
    JSON.stringify(menu.courses),
    JSON.stringify(menu.dishes),
    JSON.stringify(menu.orders),
    JSON.stringify(menu.validations),
    JSON.stringify(menu.risks),
    JSON.stringify(menu.requiredPacks),
    menu.status,
    menu.revision,
    menu.createdAt,
    menu.updatedAt,
  );
}

export function getMenuById(db: Database, menuId: string): MenuRecord | null {
  const row = db.query(`SELECT * FROM menus WHERE id = ?`).get(menuId) as MenuRow | null;
  return row ? mapMenuRow(row) : null;
}

export function listMenus(db: Database): MenuRecord[] {
  const rows = db.query(`SELECT * FROM menus ORDER BY created_at DESC`).all() as MenuRow[];
  return rows.map(mapMenuRow);
}

export function updateMenuStatus(db: Database, menuId: string, status: MenuRecord["status"]): void {
  db.query(`UPDATE menus SET status = ?, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString(), menuId);
}

export function appendOrderToMenu(db: Database, menuId: string, orderId: string): void {
  const menu = getMenuById(db, menuId);

  if (!menu) {
    return;
  }

  const orders = [...menu.orders, orderId];
  db.query(`UPDATE menus SET orders_json = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(orders),
    new Date().toISOString(),
    menuId,
  );
}

export async function persistMenuArtifacts(root: string, bundle: MenuBundle): Promise<void> {
  const menuDir = join(root, ".yeschef", "menus", bundle.menu.id);

  await Promise.all([
    writeTextFile(join(menuDir, "menu.md"), renderMenuMarkdown(bundle.menu, bundle.orders, bundle.knowledge)),
    writeJsonFile(join(menuDir, "menu.json"), bundle.menu),
    writeTextFile(join(menuDir, "plan.md"), renderPlanMarkdown(bundle.menu, bundle.orders, bundle.knowledge)),
    writeJsonFile(join(menuDir, "orders.json"), bundle.orders),
  ]);
}

function mapMenuRow(row: MenuRow): MenuRecord {
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    contextSummary: row.context_summary,
    courses: parseJsonValue<CourseRecord[]>(row.courses_json, []),
    dishes: parseJsonValue<string[]>(row.dishes_json, []),
    orders: parseJsonValue<string[]>(row.orders_json, []),
    validations: parseJsonValue<string[]>(row.validations_json, []),
    risks: parseJsonValue<string[]>(row.risks_json, []),
    requiredPacks: parseJsonValue<string[]>(row.required_packs_json, []),
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function renderMenuMarkdown(menu: MenuRecord, orders: OrderRecord[], knowledge?: KnowledgeContext): string {
  return [
    `# Menu for the Evening: ${menu.title}`,
    "",
    `- Menu ID: ${menu.id}`,
    `- Objective: ${menu.objective}`,
    `- Status: ${menu.status}`,
    `- Revision: ${menu.revision}`,
    "",
    "## Courses",
    ...menu.courses.map((course) => `- ${course.title}: ${course.summary}`),
    "",
    "## Orders",
    ...orders.map((order) => `- ${order.id} (${order.role}, ${order.agentId}, ${order.backend}, ${order.kind}): ${order.title}`),
    "",
    ...(knowledge && knowledge.results.length > 0
      ? [
          "## Relevant Knowledge",
          ...knowledge.results.map((result) => `- ${result.title} [${result.sourceType}] ${result.path}`),
          "",
        ]
      : []),
    "## Validations",
    ...menu.validations.map((validation) => `- ${validation}`),
    "",
  ].join("\n");
}

function renderPlanMarkdown(menu: MenuRecord, orders: OrderRecord[], knowledge?: KnowledgeContext): string {
  return [
    `# Plan: ${menu.title}`,
    "",
    ...(knowledge && knowledge.results.length > 0
      ? [
          "## Grounding",
          ...knowledge.results.map((result) => `- ${result.title} (${result.path})`),
          "",
        ]
      : []),
    ...orders.map(
      (order, index) => `${index + 1}. ${order.title}\n   - Role: ${order.role}\n   - Agent: ${order.agentId}\n   - Backend: ${order.backend}\n   - Model: ${order.model}\n   - Mode: ${order.mode}${order.backendAgent ? ` (${order.backendAgent})` : ""}\n   - Isolation: ${order.isolationStrategy} (${order.isolationReason})\n   - Tools: ${Object.keys(order.tools).join(", ") || "inherit"}\n   - Validations: ${order.validationsRequired.join(", ") || "none"}`,
    ),
    "",
  ].join("\n");
}

function titleFromGoal(goal: string): string {
  return goal.length > 72 ? `${goal.slice(0, 69)}...` : goal;
}

function buildContextSummary(goal: string, knowledge?: KnowledgeContext): string {
  if (!knowledge || knowledge.results.length === 0) {
    return `Tonight's service targets: ${goal}`;
  }

  const references = knowledge.results.map((result) => result.path).join(", ");
  return `Tonight's service targets: ${goal}. Knowledge profile: ${knowledge.profile}. Relevant local references: ${references}.`;
}

function buildMenuRisks(knowledge?: KnowledgeContext): string[] {
  const risks = ["Adapter output is backend-dependent and should stay normalized through Yes Chef events."];

  if (!knowledge || knowledge.results.length === 0) {
    return risks;
  }

  const signals = inferKnowledgeSignals(knowledge);
  if (signals.includes("repo-rules")) {
    risks.push("Repo rules are relevant to this goal; implementation should align with AGENTS and local policies.");
  }

  if (signals.includes("prd")) {
    risks.push("Product requirements docs match this goal; check planning and pass criteria against the PRDs.");
  }

  if (signals.includes("workflow")) {
    risks.push("Workflow-specific prompts or agent files are relevant; keep execution aligned with those local instructions.");
  }

  return risks;
}
