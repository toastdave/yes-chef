import { test, expect } from "bun:test";

import { resolveBackendForTask } from "./backends.ts";
import { createTestConfig } from "../test-support/config.ts";

test("resolveBackendForTask reroutes auto backends to match browser requirements", () => {
  const config = createTestConfig();

  const resolution = resolveBackendForTask(config, "auto", "gpt-5-codex", {
    mode: "managed",
    browser: true,
    write: true,
    requiredTools: ["bash", "read", "write"],
    backendAgent: null,
  });

  expect(resolution.backend).toBe("opencode");
  expect(resolution.requirementsMatched).toBe(true);
  expect(resolution.reason).toContain("auto-routed to opencode");
});

test("resolveBackendForTask keeps explicit backends even when capabilities mismatch", () => {
  const config = createTestConfig();

  const resolution = resolveBackendForTask(config, "codex", "gpt-5-codex", {
    mode: "managed",
    browser: true,
    write: false,
    requiredTools: ["read"],
    backendAgent: null,
  });

  expect(resolution.backend).toBe("codex");
  expect(resolution.requirementsMatched).toBe(false);
  expect(resolution.reason).toContain("explicit backend kept despite capability mismatch");
});
