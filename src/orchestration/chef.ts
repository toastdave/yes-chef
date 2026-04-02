import type { Database } from "bun:sqlite";

import { resolveAgentForRole } from "../core/agents.ts";
import { getObservedBackendCapabilities, listBackendCapabilityObservations } from "../core/backend-observations.ts";
import type { YesChefConfig } from "../core/config.ts";
import { createId } from "../core/ids.ts";
import type { MenuRecord, OrderRecord, RunRecord, ValidationRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";
import { buildKnowledgeContextForGoal, buildKnowledgeContextForReview, inferKnowledgeSignals } from "../knowledge/context.ts";
import { indexKnowledgeDocuments } from "../knowledge/index.ts";
import { resolveWorkspacePlan } from "../workspaces/create.ts";
import { runMenuValidations } from "../validation/run-gates.ts";
import { dispatchOrder } from "./dispatcher.ts";
import { appendOrderToMenu, buildMenuBundle, getMenuById, insertMenu, listMenus, persistMenuArtifacts, updateMenuStatus } from "./menu.ts";
import { insertOrder, listOrdersByKind, listOrdersByMenu, updateOrderFailureContext, updateOrderStatus } from "./orders.ts";
import { reconcileMenuStatus } from "./reconciler.ts";
import { scheduleRepairOrder } from "./retry.ts";
import { resolveOrderRouting } from "./routing.ts";
import { getNextRunnableOrders } from "./scheduler.ts";
import { listWorkspaceRecords } from "../workspaces/status.ts";
import { lookupStateAndKnowledge } from "../lookup/query.ts";

export interface PrepResult {
  menu: MenuRecord;
  orderCount: number;
}

export interface FireResult {
  menu: MenuRecord;
  runs: RunRecord[];
}

export interface PassResult {
  menu: MenuRecord;
  validations: ValidationRecord[];
  reviews: RunRecord[];
  gates: {
    executionReady: boolean;
    validationsPassed: boolean;
    browserRequired: boolean;
    browserAgentCapable: boolean;
    browserReady: boolean;
    reviewRequired: boolean;
    reviewPassed: boolean;
    conventionalCommitReady: boolean;
  };
}

export async function prepMenu(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  goal: string;
}): Promise<PrepResult> {
  const knowledge = await indexKnowledgeDocuments(options.db, options.root);
  const knowledgeContext = buildKnowledgeContextForGoal(options.db, options.goal);
  const observedCapabilities = getObservedBackendCapabilities(options.db, options.config);
  const bundle = buildMenuBundle(options.goal, options.config, knowledgeContext, observedCapabilities);
  insertMenu(options.db, bundle.menu);

  for (const order of bundle.orders) {
    insertOrder(options.db, order);
  }

  await persistMenuArtifacts(options.root, bundle);

  await options.bus.emit({
    type: "menu.created",
    menu_id: bundle.menu.id,
    role: "chef",
    payload: {
      title: bundle.menu.title,
      objective: bundle.menu.objective,
      knowledgeIndexed: knowledge.indexed,
      knowledgeTotal: knowledge.total,
      knowledgeProfile: knowledgeContext.profile,
      knowledgeMatches: knowledgeContext.results.map((result) => result.path),
      knowledgeSignals: inferKnowledgeSignals(knowledgeContext),
      overlays: {
        dangerousPaths: options.config.overlays.dangerousPaths,
        acceptanceCriteria: options.config.overlays.acceptanceCriteria,
      },
    },
  });

  for (const order of bundle.orders) {
    await options.bus.emit({
      type: "order.created",
      menu_id: bundle.menu.id,
      order_id: order.id,
      role: order.role,
      payload: {
        title: order.title,
        kind: order.kind,
        agentId: order.agentId,
        mode: order.mode,
        retryCount: order.retryCount,
        isolationStrategy: order.isolationStrategy,
        skills: order.skills,
        packs: order.packs,
        routingReasons: order.routingReasons,
      },
    });

    await options.bus.emit({
      type: "order.queued",
      menu_id: bundle.menu.id,
      order_id: order.id,
      role: order.role,
      payload: {
        backend: order.backend,
        model: order.model,
        agentId: order.agentId,
        backendAgent: order.backendAgent,
        skills: order.skills,
        packs: order.packs,
        knowledgeSources: order.knowledgeSources,
      },
    });
  }

  return {
    menu: bundle.menu,
    orderCount: bundle.orders.length,
  };
}

export async function fireMenu(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  menuId: string;
}): Promise<FireResult> {
  const menu = getMenuById(options.db, options.menuId);

  if (!menu) {
    throw new Error(`Unknown menu: ${options.menuId}`);
  }

  updateMenuStatus(options.db, menu.id, "running");

  const runs: RunRecord[] = [];
  while (true) {
    const runnableOrders = getNextRunnableOrders(options.db, menu.id);

    if (runnableOrders.length === 0) {
      break;
    }

    for (const order of runnableOrders) {
      await options.bus.emit({
        type: "order.runnable",
        menu_id: menu.id,
        order_id: order.id,
        role: order.role,
        payload: { title: order.title, agentId: order.agentId, retryCount: order.retryCount },
      });

      runs.push(
        await dispatchOrder({
          db: options.db,
          root: options.root,
          config: options.config,
          bus: options.bus,
          menu,
          order,
        }),
      );
    }
  }

  const status = reconcileMenuStatus(options.db, menu.id);
  updateMenuStatus(options.db, menu.id, status);
  await options.bus.emit({
    type: "service.completed",
    menu_id: menu.id,
    role: "chef",
    payload: { status, runCount: runs.length },
  });

  const updatedMenu = getMenuById(options.db, menu.id);

  if (!updatedMenu) {
    throw new Error(`Menu disappeared during fire flow: ${menu.id}`);
  }

  return { menu: updatedMenu, runs };
}

export async function passMenu(options: {
  db: Database;
  root: string;
  config: YesChefConfig;
  bus: EventBus;
  menuId: string;
}): Promise<PassResult> {
  const menu = getMenuById(options.db, options.menuId);

  if (!menu) {
    throw new Error(`Unknown menu: ${options.menuId}`);
  }

  const orders = listOrdersByMenu(options.db, menu.id);
  const expoAgent = resolveAgentForRole(options.config, "expo");
  const uiWorkDetected = detectUiWork(menu, orders);
  const browserRequired = uiWorkDetected && (options.config.modes[options.config.defaults.mode]?.requireBrowserForUi ?? false);
  const browserValidationCommands = uiWorkDetected ? resolvePackValidationCommands(options.config, ["browser"]) : {};
  const browserValidationPackMap = Object.fromEntries(Object.keys(browserValidationCommands).map((name) => [name, ["browser"]]));
  const browserAgentCapable = expoAgent.backendCapabilities.browser;
  const browserReady = !browserRequired || (options.config.packs.browser?.enabled === true && Object.keys(browserValidationCommands).length > 0);

  const validations = await runMenuValidations({
    db: options.db,
    root: options.root,
    config: options.config,
    bus: options.bus,
    menu,
    extraValidations: {
      ...buildCompletionValidations(options.config),
      ...browserValidationCommands,
    },
    validationPackMap: browserValidationPackMap,
  });

  const validationRequired = options.config.policies.completion.requireValidations;
  const allPassed = validationRequired ? validations.every((validation) => validation.status === "passed") : true;
  const executionReady = reconcileMenuStatus(options.db, menu.id) === "completed";
  const mode = options.config.modes[options.config.defaults.mode];
  const reviewRequired = mode?.requireReview ?? false;
  const conventionalCommitReady = !options.config.policies.completion.conventionalCommits
    || validations.some((validation) => validation.name === "conventional-commit" && validation.status === "passed");
  const reviews = allPassed && executionReady && browserReady && reviewRequired ? await runCriticPass(options.db, options.root, options.config, options.bus, menu) : [];
  const reviewPassed = !reviewRequired || reviews.every((review) => review.status === "completed");
  const status: MenuRecord["status"] = allPassed && executionReady && browserReady && reviewPassed && conventionalCommitReady
    ? (reviewRequired ? "ready" : "completed")
    : "blocked";
  updateMenuStatus(options.db, menu.id, status);

  if (allPassed && executionReady && reviewPassed && reviewRequired) {
    await options.bus.emit({
      type: "approval.required",
      menu_id: menu.id,
      role: "chef",
      payload: {
        reason: "Pass gates satisfied; ready for merge approval.",
        conventionalCommits: options.config.policies.completion.conventionalCommits,
      },
    });
  }

  const updatedMenu = getMenuById(options.db, menu.id);

  if (!updatedMenu) {
    throw new Error(`Menu disappeared during pass flow: ${menu.id}`);
  }

  return {
    menu: updatedMenu,
    validations,
    reviews,
    gates: {
      executionReady,
      validationsPassed: allPassed,
      browserRequired,
      browserAgentCapable,
      browserReady,
      reviewRequired,
      reviewPassed,
      conventionalCommitReady,
    },
  };
}

export function buildStatusSnapshot(db: Database): {
  menus: MenuRecord[];
  orders: ReturnType<typeof listOrdersByMenu>;
  workspaces: ReturnType<typeof listWorkspaceRecords>;
  backendObservations: ReturnType<typeof listBackendCapabilityObservations>;
} {
  const menus = listMenus(db);
  const activeMenu = menus[0];

  return {
    menus,
    orders: activeMenu ? listOrdersByMenu(db, activeMenu.id) : [],
    workspaces: listWorkspaceRecords(db),
    backendObservations: listBackendCapabilityObservations(db),
  };
}

function buildCompletionValidations(config: YesChefConfig): Record<string, string> {
  if (!config.policies.completion.conventionalCommits) {
    return {};
  }

  return {
    "conventional-commit":
      "msg=$(git log -1 --pretty=%s 2>/dev/null) && printf '%s\\n' \"$msg\" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\([^)]+\\))?!?: .+'",
  };
}

function detectUiWork(menu: MenuRecord, orders: OrderRecord[]): boolean {
  const text = `${menu.objective} ${menu.title} ${orders.map((order) => `${order.title} ${order.skills.join(" ")} ${order.packs.join(" ")}`).join(" ")}`.toLowerCase();
  return /(ui|frontend|browser|page|screen|component|design)/.test(text);
}

function resolvePackValidationCommands(config: YesChefConfig, packIds: string[]): Record<string, string> {
  const commands: Record<string, string> = {};

  for (const packId of packIds) {
    const pack = config.packs[packId];
    if (!pack || pack.enabled === false) {
      continue;
    }

    for (const validation of pack.validations ?? []) {
      const command = config.validations[validation];
      if (command) {
        commands[validation] = command;
      }
    }

    for (const [name, command] of Object.entries(pack.validationCommands ?? {})) {
      commands[name] = command;
    }
  }

  return commands;
}

async function runCriticPass(
  db: Database,
  root: string,
  config: YesChefConfig,
  bus: EventBus,
  menu: MenuRecord,
): Promise<RunRecord[]> {
  const allOrders = listOrdersByMenu(db, menu.id);
  const existingReviews = allOrders.filter((order) => order.kind === "review");
  const latestReview = existingReviews.at(-1) ?? null;
  const targetOrder = latestReviewTargetOrder(allOrders);
  const implementationUpdatedAt = latestImplementationTimestamp(allOrders);

  let reviewOrder = latestReview;
  const shouldCreateReview =
    !reviewOrder
    || reviewOrder.status !== "completed"
    || implementationUpdatedAt > reviewOrder.updatedAt
    || targetOrder === null
    || reviewOrder.failureContext.reviewTargetOrderId !== targetOrder.id;

  const reviewKnowledge = targetOrder ? buildKnowledgeContextForReview(db, menu, targetOrder) : null;
  const observedCapabilities = getObservedBackendCapabilities(db, config);

  if (shouldCreateReview) {
    reviewOrder = createReviewOrder(config, menu, targetOrder, reviewKnowledge, observedCapabilities);
    insertOrder(db, reviewOrder);
    appendOrderToMenu(db, menu.id, reviewOrder.id);

    await bus.emit({
      type: "order.created",
      menu_id: menu.id,
      order_id: reviewOrder.id,
      role: reviewOrder.role,
      payload: {
        title: reviewOrder.title,
        kind: reviewOrder.kind,
        agentId: reviewOrder.agentId,
        reviewTargetOrderId: targetOrder?.id ?? null,
        knowledgeProfile: reviewKnowledge?.profile ?? null,
        skills: reviewOrder.skills,
        packs: reviewOrder.packs,
      },
    });

    await bus.emit({
      type: "order.queued",
      menu_id: menu.id,
      order_id: reviewOrder.id,
      role: reviewOrder.role,
      payload: {
        backend: reviewOrder.backend,
        model: reviewOrder.model,
        agentId: reviewOrder.agentId,
        reviewTargetOrderId: targetOrder?.id ?? null,
        knowledgePaths: reviewKnowledge?.results.map((result) => result.path) ?? [],
        skills: reviewOrder.skills,
        packs: reviewOrder.packs,
      },
    });
  }

  if (!reviewOrder) {
    return [];
  }

  if (!shouldCreateReview && reviewOrder.status === "completed") {
    return [];
  }

  await bus.emit({
    type: "review.started",
    menu_id: menu.id,
    order_id: reviewOrder.id,
    role: reviewOrder.role,
    payload: {
      agentId: reviewOrder.agentId,
      backend: reviewOrder.backend,
      reviewTargetOrderId: targetOrder?.id ?? null,
      knowledgeProfile: reviewKnowledge?.profile ?? null,
    },
  });

  const reviewRun = await dispatchOrder({
    db,
    root,
    config,
    bus,
    menu,
    order: reviewOrder,
  });

  if (reviewRun.status === "failed" && targetOrder) {
    const assessment = assessReviewFailure(db, menu, reviewOrder, targetOrder, reviewRun, reviewKnowledge);
    updateOrderFailureContext(db, reviewOrder.id, {
      ...reviewOrder.failureContext,
      reviewAssessment: assessment,
    });
    const reviewWorkspace = listWorkspaceRecords(db).find((workspace) => workspace.orderId === reviewOrder.id) ?? null;
    const { stdoutPath, stderrPath } = artifactPathsForRun(db, reviewRun.id);

    if (reviewWorkspace) {
      await scheduleRepairOrder({
        db,
        root,
        config,
        bus,
        failedOrder: reviewOrder,
        failedRun: reviewRun,
        repairTargetOrder: targetOrder,
        workspace: reviewWorkspace,
        stdoutPath,
        stderrPath,
        reason: assessment.repairReason,
        handoff: {
          reviewAssessment: assessment,
        },
      });
    }
  }

  await bus.emit({
    type: "review.completed",
    menu_id: menu.id,
    order_id: reviewOrder.id,
    run_id: reviewRun.id,
    role: reviewOrder.role,
    payload: {
      status: reviewRun.status,
      summary: reviewRun.summary,
      reviewTargetOrderId: targetOrder?.id ?? null,
    },
  });

  return [reviewRun];
}

function createReviewOrder(
  config: YesChefConfig,
  menu: MenuRecord,
  targetOrder: ReturnType<typeof latestReviewTargetOrder>,
  knowledge: ReturnType<typeof buildKnowledgeContextForReview> | null,
  observedCapabilities: Record<string, import("../core/backends.ts").BackendCapabilities>,
) {
  const now = new Date().toISOString();
  const agent = resolveAgentForRole(config, "critic");
  const orderId = createId("O");
  const workspacePlan = resolveWorkspacePlan(config, {
    id: orderId,
    menuId: menu.id,
    title: `Review ${menu.title}`,
    kind: "review",
    role: "critic",
    agentId: agent.id,
    backend: agent.backend,
    model: agent.model,
    mode: agent.mode,
    backendAgent: agent.backendAgent,
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 0,
    failureContext: {
      reviewTargetOrderId: targetOrder?.id ?? null,
      reviewTargetTitle: targetOrder?.title ?? null,
      knowledgeProfile: knowledge?.profile ?? null,
      knowledgePaths: knowledge?.results.map((result) => result.path) ?? [],
    },
    isolationStrategy: "in-place",
    isolationReason: "review default",
    profile: config.defaults.profile,
    promptTemplate: agent.prompt,
    tools: agent.tools,
    permissions: agent.permissions,
    workspaceId: null,
      dependsOn: targetOrder ? [targetOrder.id] : [],
      packs: menu.requiredPacks,
      skills: ["review"],
      routingReasons: [],
      knowledgeSources: [],
      overlayContext: {},
      validationsRequired: [],
    retryLimit: 1,
    status: "queued",
    priority: 100,
    createdAt: now,
    updatedAt: now,
  });

  const baseOrder: OrderRecord = {
    id: orderId,
    menuId: menu.id,
    title: `Review ${menu.title}`,
    kind: "review" as const,
    role: "critic" as const,
    agentId: agent.id,
    backend: agent.backend,
    model: agent.model,
    mode: agent.mode,
    backendAgent: agent.backendAgent,
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 0,
    failureContext: {
      reviewTargetOrderId: targetOrder?.id ?? null,
      reviewTargetTitle: targetOrder?.title ?? null,
      knowledgeProfile: knowledge?.profile ?? null,
      knowledgePaths: knowledge?.results.map((result) => result.path) ?? [],
    },
    isolationStrategy: workspacePlan.strategy,
    isolationReason: workspacePlan.reason,
    profile: config.defaults.profile,
    promptTemplate: agent.prompt,
    tools: agent.tools,
    permissions: agent.permissions,
    workspaceId: null,
    dependsOn: targetOrder ? [targetOrder.id] : [],
    packs: menu.requiredPacks,
    skills: ["review"],
    routingReasons: [],
    knowledgeSources: [],
    overlayContext: {},
    validationsRequired: [],
    retryLimit: 1,
    status: "queued" as const,
    priority: 100,
    createdAt: now,
    updatedAt: now,
  };

  const routing = resolveOrderRouting({
    config,
    menu,
    order: baseOrder,
    agent,
    knowledge: knowledge ?? undefined,
    observedCapabilities,
  });

  return {
    ...baseOrder,
    backend: routing.backend,
    packs: routing.packs,
    skills: routing.skills,
    routingReasons: routing.routingReasons,
    knowledgeSources: routing.knowledgeSources,
    overlayContext: routing.overlayContext,
    validationsRequired: routing.validationsRequired,
    tools: routing.tools,
    permissions: routing.permissions,
  };
}

function latestImplementationTimestamp(orders: ReturnType<typeof listOrdersByMenu>): string {
  return orders
    .filter((order) => order.kind !== "review")
    .map((order) => order.updatedAt)
    .sort()
    .at(-1) ?? "";
}

function latestReviewTargetOrder(orders: ReturnType<typeof listOrdersByMenu>) {
  return [...orders]
    .filter((order) => order.kind === "implement" || order.kind === "repair" || order.kind === "merge" || order.kind === "rules-update")
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .at(-1) ?? null;
}

function artifactPathsForRun(db: Database, runId: string): { stdoutPath: string; stderrPath: string } {
  const rows = db.query(`SELECT type, path FROM artifacts WHERE run_id = ?`).all(runId) as Array<{ type: string; path: string }>;
  const stdoutPath = rows.find((row) => row.type === "stdout_log")?.path ?? "";
  const stderrPath = rows.find((row) => row.type === "stderr_log")?.path ?? "";
  return { stdoutPath, stderrPath };
}

function assessReviewFailure(
  db: Database,
  menu: MenuRecord,
  reviewOrder: OrderRecord,
  targetOrder: NonNullable<ReturnType<typeof latestReviewTargetOrder>>,
  reviewRun: RunRecord,
  reviewKnowledge: ReturnType<typeof buildKnowledgeContextForReview> | null,
): {
  category: string;
  severity: "medium" | "high";
  reason: string;
  repairReason: string;
  guidance: string[];
  stateMatches: Array<{ kind: string; id: string; title: string }>;
  knowledgeMatches: string[];
} {
  const summary = `${reviewRun.summary ?? ""} ${targetOrder.title} ${menu.objective} ${reviewOrder.title}`.toLowerCase();
  const lookup = lookupStateAndKnowledge(db, `${targetOrder.title} ${reviewRun.summary ?? menu.objective}`, {
    limit: 5,
    sourceTypes: reviewKnowledge?.sourceTypes,
  });

  let category = "implementation-gap";
  let severity: "medium" | "high" = "medium";
  const guidance: string[] = [];

  if (/(security|auth|secret|credential|permission)/.test(summary)) {
    category = "security-risk";
    severity = "high";
    guidance.push("Review security-sensitive code paths, permissions, and any credential handling before re-running Critic.");
  } else if (/(architecture|boundary|design|orchestrat|ownership)/.test(summary)) {
    category = "architecture-fit";
    severity = "high";
    guidance.push("Repair the implementation to align with the intended architecture boundaries and orchestration ownership.");
  } else if (/(policy|rule|agents|conventional|compliance)/.test(summary)) {
    category = "policy-compliance";
    severity = "high";
    guidance.push("Update the implementation to follow repo rules, policy checks, and the expected workflow conventions.");
  } else if (/(test|lint|type|validation|failing)/.test(summary)) {
    category = "validation-gap";
    guidance.push("Fix the implementation so validations and pass gates can succeed on the next attempt.");
  } else {
    guidance.push("Tighten the implementation based on reviewer feedback, then re-run validations and Critic.");
  }

  if ((reviewKnowledge?.results.length ?? 0) > 0) {
    guidance.push(`Re-read the most relevant local references: ${reviewKnowledge!.results.map((result) => result.path).join(", ")}.`);
  }

  if (lookup.state.length > 0) {
    guidance.push(`Cross-check related runtime state before repairing: ${lookup.state.map((result) => result.id).join(", ")}.`);
  }

  return {
    category,
    severity,
    reason: `Critic flagged ${category.replaceAll("-", " ")} for ${targetOrder.title}.`,
    repairReason: `critic review requested implementation repair (${category})`,
    guidance,
    stateMatches: lookup.state.map((result) => ({ kind: result.kind, id: result.id, title: result.title })),
    knowledgeMatches: reviewKnowledge?.results.map((result) => result.path) ?? [],
  };
}
