import { test, expect } from "bun:test";

import { resolveAgent } from "../core/agents.ts";
import { resolveBackendCapabilities } from "../core/backends.ts";
import { resolveOrderRouting } from "./routing.ts";
import { createTestConfig } from "../test-support/config.ts";
import type { MenuRecord, OrderRecord } from "../core/models.ts";

test("resolveOrderRouting uses observed capabilities before rerouting", () => {
  const config = createTestConfig();
  const agent = resolveAgent(config, "line-cook");
  const now = new Date().toISOString();
  const menu: MenuRecord = {
    id: "M-ui",
    title: "UI Task",
    objective: "Update browser page layout",
    contextSummary: "ui task",
    courses: [],
    dishes: [],
    orders: [],
    validations: [],
    risks: [],
    requiredPacks: ["browser"],
    status: "prepared",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const order: OrderRecord = {
    id: "O-ui",
    menuId: menu.id,
    title: "Implement browser page layout",
    kind: "implement",
    role: "line-cook",
    agentId: agent.id,
    backend: agent.backend,
    model: agent.model,
    mode: "managed",
    backendAgent: null,
    repairForOrderId: null,
    sourceRunId: null,
    retryCount: 0,
    failureContext: {},
    isolationStrategy: "in-place",
    isolationReason: "test",
    profile: "default",
    promptTemplate: "implementer",
    tools: { bash: true, read: true, write: true },
    permissions: {},
    workspaceId: null,
    dependsOn: [],
    packs: ["browser"],
    skills: [],
    routingReasons: [],
    knowledgeSources: [],
    overlayContext: {},
    validationsRequired: [],
    retryLimit: 1,
    status: "queued",
    priority: 1,
    createdAt: now,
    updatedAt: now,
  };

  const routing = resolveOrderRouting({
    config,
    menu,
    order,
    agent,
    observedCapabilities: {
      codex: {
        ...agent.backendCapabilities,
        browser: true,
        toolSurfaces: [...new Set([...agent.backendCapabilities.toolSurfaces, "browser"])].sort(),
      },
      opencode: resolveBackendCapabilities("opencode", config.backends.opencode),
    },
  });

  expect(routing.backend).toBe("codex");
  expect(routing.routingReasons.join(" ")).not.toContain("backend rerouted from codex to opencode");
});
