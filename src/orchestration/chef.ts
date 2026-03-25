import type { Database } from "bun:sqlite";

import type { YesChefConfig } from "../core/config.ts";
import type { MenuRecord, RunRecord, ValidationRecord } from "../core/models.ts";
import type { EventBus } from "../events/emit.ts";
import { runMenuValidations } from "../validation/run-gates.ts";
import { dispatchOrder } from "./dispatcher.ts";
import { buildMenuBundle, getMenuById, insertMenu, listMenus, persistMenuArtifacts, updateMenuStatus } from "./menu.ts";
import { insertOrder, listOrdersByMenu } from "./orders.ts";
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
  });

  const validationRequired = options.config.policies.completion.requireValidations;
  const allPassed = validationRequired ? validations.every((validation) => validation.status === "passed") : true;
  const orders = listOrdersByMenu(options.db, menu.id);
  const ordersCompleted = orders.length > 0 && orders.every((order) => order.status === "completed");
  const mode = options.config.modes[options.config.defaults.mode];
  const status: MenuRecord["status"] = allPassed && ordersCompleted ? (mode?.requireReview ? "ready" : "completed") : "blocked";
  updateMenuStatus(options.db, menu.id, status);

  if (allPassed && mode?.requireReview) {
    await options.bus.emit({
      type: "approval.required",
      menu_id: menu.id,
      role: "chef",
      payload: { reason: "Mode requires review before final merge.", conventionalCommits: options.config.policies.completion.conventionalCommits },
    });
  }

  const updatedMenu = getMenuById(options.db, menu.id);

  if (!updatedMenu) {
    throw new Error(`Menu disappeared during pass flow: ${menu.id}`);
  }

  return { menu: updatedMenu, validations };
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
