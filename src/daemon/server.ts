#!/usr/bin/env bun

import { DEFAULT_DAEMON_PORT } from "../core/constants.ts";
import { loadConfig } from "../core/config.ts";
import { logInfo } from "../core/logger.ts";
import { getDatabase } from "../db/client.ts";
import { migrateDatabase } from "../db/migrate.ts";
import { createEventBus } from "../events/emit.ts";
import { handleRequest } from "./routes.ts";

export async function startDaemonServer(root = process.cwd(), port = DEFAULT_DAEMON_PORT): Promise<void> {
  const config = await loadConfig(root);
  await migrateDatabase(root);
  const db = getDatabase(root);
  const bus = createEventBus(db, root);

  Bun.serve({
    port,
    idleTimeout: 255,
    fetch(request) {
      return handleRequest({ root, config, db, bus }, request);
    },
  });

  logInfo(`Yes Chef daemon listening on http://127.0.0.1:${port}`);
}

if (import.meta.main) {
  await startDaemonServer();
}
