import { Database } from "bun:sqlite";
import { test, expect } from "bun:test";

import { getObservedBackendCapabilities, recordBackendCapabilityObservation } from "./backend-observations.ts";
import { schemaStatements } from "../db/schema.ts";
import { createTestConfig } from "../test-support/config.ts";
import type { OrderRecord } from "./models.ts";

test("backend observations promote observed delegate support and tools", () => {
  const db = new Database(":memory:");
  db.exec(schemaStatements.find((statement) => statement.includes("CREATE TABLE IF NOT EXISTS backend_capability_observations"))!);

  const order: OrderRecord = {
    id: "O-test",
    menuId: "M-test",
    title: "Delegate fix",
    kind: "repair",
    role: "line-cook",
    agentId: "line-cook",
    backend: "codex",
    model: "gpt-5-codex",
    mode: "delegate",
    backendAgent: "fixer",
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 1,
    failureContext: {},
    isolationStrategy: "worktree",
    isolationReason: "test",
    profile: "default",
    promptTemplate: "implementer",
    tools: { bash: true, read: true, write: true },
    permissions: {},
    workspaceId: null,
    dependsOn: [],
    packs: [],
    skills: [],
    routingReasons: [],
    knowledgeSources: [],
    overlayContext: {},
    validationsRequired: [],
    retryLimit: 2,
    status: "completed",
    priority: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  recordBackendCapabilityObservation(db, order);

  const observed = getObservedBackendCapabilities(db, createTestConfig());
  expect(observed.codex.delegate).toBe(true);
  expect(observed.codex.toolSurfaces).toContain("write");
});
