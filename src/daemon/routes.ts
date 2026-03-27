import type { Database } from "bun:sqlite";

import type { YesChefConfig } from "../core/config.ts";
import type { EventBus } from "../events/emit.ts";
import { listEvents } from "../events/store.ts";
import { indexKnowledgeDocuments } from "../knowledge/index.ts";
import { countKnowledgeDocuments, searchKnowledgeDocuments } from "../knowledge/search.ts";
import { getMenuById } from "../orchestration/menu.ts";
import { getOrderById } from "../orchestration/orders.ts";
import { buildStatusSnapshot, fireMenu, passMenu, prepMenu } from "../orchestration/chef.ts";
import { createSseHeaders, toSseEvent } from "./stream.ts";

interface RunRow {
  id: string;
  order_id: string;
  role: string;
  agent_id: string;
  backend: string;
  model: string;
  mode: string;
  backend_agent: string | null;
  command: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  summary: string | null;
  artifact_ids_json: string;
  created_at: string;
  updated_at: string;
}

interface ArtifactRow {
  id: string;
  run_id: string;
  type: string;
  path: string;
  metadata_json: string;
  created_at: string;
}

export interface DaemonContext {
  root: string;
  config: YesChefConfig;
  db: Database;
  bus: EventBus;
}

export async function handleRequest(context: DaemonContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/status") {
    return json(buildStatusSnapshot(context.db));
  }

  if (request.method === "GET" && url.pathname === "/knowledge/search") {
    const query = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const sourceTypes = url.searchParams.getAll("sourceType");
    return json({
      query,
      sourceTypes,
      results: searchKnowledgeDocuments(context.db, query, { limit, sourceTypes }),
    });
  }

  if (request.method === "POST" && url.pathname === "/knowledge/index") {
    const result = await indexKnowledgeDocuments(context.db, context.root);
    return json({ ...result, indexedDocuments: countKnowledgeDocuments(context.db) });
  }

  if (request.method === "GET" && url.pathname === "/events") {
    return handleEventsRequest(context, request, url.searchParams.get("menuId"));
  }

  if (request.method === "POST" && url.pathname === "/menus") {
    const body = (await request.json()) as { goal?: string };

    if (!body.goal) {
      return json({ error: "Missing goal" }, 400);
    }

    const result = await prepMenu({
      db: context.db,
      root: context.root,
      config: context.config,
      bus: context.bus,
      goal: body.goal,
    });

    return json(result, 201);
  }

  if (parts[0] === "menus" && parts.length === 2 && request.method === "GET") {
    const menu = getMenuById(context.db, parts[1]);
    return menu ? json(menu) : json({ error: "Menu not found" }, 404);
  }

  if (parts[0] === "menus" && parts[2] === "prep" && request.method === "POST") {
    const existing = getMenuById(context.db, parts[1]);

    if (!existing) {
      return json({ error: "Menu not found" }, 404);
    }

    await context.bus.emit({
      type: "menu.revised",
      menu_id: existing.id,
      role: "sous-chef",
      payload: { revision: existing.revision },
    });

    return json(existing);
  }

  if (parts[0] === "menus" && parts[2] === "fire" && request.method === "POST") {
    const result = await fireMenu({
      db: context.db,
      root: context.root,
      config: context.config,
      bus: context.bus,
      menuId: parts[1],
    });

    return json(result);
  }

  if (parts[0] === "menus" && parts[2] === "pass" && request.method === "POST") {
    const result = await passMenu({
      db: context.db,
      root: context.root,
      config: context.config,
      bus: context.bus,
      menuId: parts[1],
    });

    return json(result);
  }

  if (parts[0] === "orders" && parts.length === 2 && request.method === "GET") {
    const order = getOrderById(context.db, parts[1]);
    return order ? json(order) : json({ error: "Order not found" }, 404);
  }

  if (parts[0] === "runs" && parts.length === 2 && request.method === "GET") {
    const run = context.db.query(`SELECT * FROM runs WHERE id = ?`).get(parts[1]) as RunRow | null;

    if (!run) {
      return json({ error: "Run not found" }, 404);
    }

    const order = getOrderById(context.db, run.order_id);
    const artifacts = context.db.query(`SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC`).all(parts[1]) as ArtifactRow[];
    return json({ run, order, artifacts });
  }

  return json({ error: "Not found" }, 404);
}

async function handleEventsRequest(context: DaemonContext, request: Request, menuId: string | null): Promise<Response> {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  for (const event of listEvents(context.db, menuId)) {
    await writer.write(encoder.encode(toSseEvent(event)));
  }

  const unsubscribe = context.bus.subscribe(async (event) => {
    if (menuId && event.menu_id !== menuId) {
      return;
    }

    await writer.write(encoder.encode(toSseEvent(event)));
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe();
    void writer.close();
  });

  return new Response(stream.readable, { headers: createSseHeaders() });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
