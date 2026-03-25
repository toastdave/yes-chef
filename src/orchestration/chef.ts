import type { Database } from "bun:sqlite";

import { resolveAgentForRole } from "../core/agents.ts";
import type { YesChefConfig } from "../core/config.ts";
import { createId } from "../core/ids.ts";
import type { MenuRecord, RunRecord, ValidationRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";
import { resolveWorkspacePlan } from "../workspaces/create.ts";
import { runMenuValidations } from "../validation/run-gates.ts";
import { dispatchOrder } from "./dispatcher.ts";
import { appendOrderToMenu, buildMenuBundle, getMenuById, insertMenu, listMenus, persistMenuArtifacts, updateMenuStatus } from "./menu.ts";
import { insertOrder, listOrdersByKind, listOrdersByMenu, updateOrderStatus } from "./orders.ts";
import { reconcileMenuStatus } from "./reconciler.ts";
import { getNextRunnableOrders } from "./scheduler.ts";
import { listWorkspaceRecords } from "../workspaces/status.ts";

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
  const bundle = buildMenuBundle(options.goal, options.config);
  insertMenu(options.db, bundle.menu);

  for (const order of bundle.orders) {
    insertOrder(options.db, order);
  }

  await persistMenuArtifacts(options.root, bundle);

  await options.bus.emit({
    type: "menu.created",
    menu_id: bundle.menu.id,
    role: "chef",
    payload: { title: bundle.menu.title, objective: bundle.menu.objective },
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
      },
    });

    await options.bus.emit({
      type: "order.queued",
      menu_id: bundle.menu.id,
      order_id: order.id,
      role: order.role,
      payload: { backend: order.backend, model: order.model, agentId: order.agentId, backendAgent: order.backendAgent },
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

  const validations = await runMenuValidations({
    db: options.db,
    root: options.root,
    config: options.config,
    bus: options.bus,
    menu,
    extraValidations: buildCompletionValidations(options.config),
  });

  const validationRequired = options.config.policies.completion.requireValidations;
  const allPassed = validationRequired ? validations.every((validation) => validation.status === "passed") : true;
  const executionReady = reconcileMenuStatus(options.db, menu.id) === "completed";
  const mode = options.config.modes[options.config.defaults.mode];
  const reviewRequired = mode?.requireReview ?? false;
  const conventionalCommitReady = !options.config.policies.completion.conventionalCommits
    || validations.some((validation) => validation.name === "conventional-commit" && validation.status === "passed");
  const reviews = allPassed && executionReady && reviewRequired ? await runCriticPass(options.db, options.root, options.config, options.bus, menu) : [];
  const reviewPassed = !reviewRequired || reviews.every((review) => review.status === "completed");
  const status: MenuRecord["status"] = allPassed && executionReady && reviewPassed && conventionalCommitReady
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
} {
  const menus = listMenus(db);
  const activeMenu = menus[0];

  return {
    menus,
    orders: activeMenu ? listOrdersByMenu(db, activeMenu.id) : [],
    workspaces: listWorkspaceRecords(db),
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

async function runCriticPass(
  db: Database,
  root: string,
  config: YesChefConfig,
  bus: EventBus,
  menu: MenuRecord,
): Promise<RunRecord[]> {
  const existingReviews = listOrdersByKind(db, menu.id, "review");
  const latestReview = existingReviews.at(-1) ?? null;
  const implementationUpdatedAt = latestImplementationTimestamp(listOrdersByMenu(db, menu.id));

  let reviewOrder = latestReview;
  const shouldCreateReview = !reviewOrder;
  const shouldRerunReview =
    reviewOrder !== null
    && (reviewOrder.status !== "completed" || implementationUpdatedAt > reviewOrder.updatedAt);

  if (shouldCreateReview) {
    reviewOrder = createReviewOrder(config, menu);
    insertOrder(db, reviewOrder);
    appendOrderToMenu(db, menu.id, reviewOrder.id);

    await bus.emit({
      type: "order.created",
      menu_id: menu.id,
      order_id: reviewOrder.id,
      role: reviewOrder.role,
      payload: { title: reviewOrder.title, kind: reviewOrder.kind, agentId: reviewOrder.agentId },
    });
  }

  if (!reviewOrder) {
    return [];
  }

  if (reviewOrder.status === "completed" && !shouldRerunReview) {
    return [];
  }

  updateOrderStatus(db, reviewOrder.id, "queued");

  await bus.emit({
    type: "review.started",
    menu_id: menu.id,
    order_id: reviewOrder.id,
    role: reviewOrder.role,
    payload: { agentId: reviewOrder.agentId, backend: reviewOrder.backend },
  });

  const reviewRun = await dispatchOrder({
    db,
    root,
    config,
    bus,
    menu,
    order: reviewOrder,
  });

  await bus.emit({
    type: "review.completed",
    menu_id: menu.id,
    order_id: reviewOrder.id,
    run_id: reviewRun.id,
    role: reviewOrder.role,
    payload: { status: reviewRun.status, summary: reviewRun.summary },
  });

  return [reviewRun];
}

function createReviewOrder(config: YesChefConfig, menu: MenuRecord) {
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
    failureContext: {},
    isolationStrategy: "in-place",
    isolationReason: "review default",
    profile: config.defaults.profile,
    promptTemplate: agent.prompt,
    tools: agent.tools,
    permissions: agent.permissions,
    workspaceId: null,
    dependsOn: [],
    packs: menu.requiredPacks,
    skills: ["review"],
    validationsRequired: [],
    retryLimit: 1,
    status: "queued",
    priority: 100,
    createdAt: now,
    updatedAt: now,
  });

  return {
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
    skills: ["review"],
    validationsRequired: [],
    retryLimit: 1,
    status: "queued" as const,
    priority: 100,
    createdAt: now,
    updatedAt: now,
  };
}

function latestImplementationTimestamp(orders: ReturnType<typeof listOrdersByMenu>): string {
  return orders
    .filter((order) => order.kind !== "review")
    .map((order) => order.updatedAt)
    .sort()
    .at(-1) ?? "";
}
