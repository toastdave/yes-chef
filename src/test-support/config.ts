import type { YesChefConfig } from "../core/config.ts";

export function createTestConfig(): YesChefConfig {
  return {
    project: {
      name: "test-project",
      baseBranch: "main",
    },
    defaults: {
      backend: "auto",
      model: "gpt-5-codex",
      mode: "safe",
      profile: "default",
      agent: "line-cook",
    },
    backends: {
      codex: {
        command: "bash",
        args: [],
        enabled: true,
        capabilities: {
          managed: true,
          delegate: false,
          browser: false,
          patching: "patch",
          toolSurfaces: ["bash", "read", "write"],
        },
      },
      opencode: {
        command: "bash",
        args: [],
        enabled: true,
        capabilities: {
          managed: true,
          delegate: true,
          browser: true,
          patching: "edit",
          toolSurfaces: ["bash", "browser", "read", "write"],
        },
      },
    },
    agents: {
      "line-cook": {
        role: "line-cook",
        backend: "auto",
        model: "gpt-5-codex",
        prompt: "implementer",
        mode: "managed",
        tools: { write: true, read: true, bash: true },
      },
      expo: {
        role: "expo",
        backend: "auto",
        model: "gpt-5-codex",
        prompt: "validator",
        mode: "managed",
      },
      critic: {
        role: "critic",
        backend: "auto",
        model: "gpt-5-codex",
        prompt: "reviewer",
        mode: "managed",
      },
      chef: {
        role: "chef",
        backend: "auto",
        model: "gpt-5-codex",
        prompt: "chef",
        mode: "managed",
      },
      "sous-chef": {
        role: "sous-chef",
        backend: "auto",
        model: "gpt-5-codex",
        prompt: "planner",
        mode: "managed",
      },
    },
    skills: {
      "verification-before-completion": {
        summary: "verify before done",
      },
      "frontend-design": {
        summary: "frontend design",
      },
      "worktree-usage": {
        summary: "worktree",
      },
      "architecture-review": {
        summary: "review",
      },
    },
    roleDefaults: {
      chef: "chef",
      "sous-chef": "sous-chef",
      "line-cook": "line-cook",
      expo: "expo",
      critic: "critic",
    },
    modes: {
      safe: {
        maxRetries: 2,
        requireReview: true,
        requireBrowserForUi: true,
      },
    },
    overlays: {
      repoMap: [],
      architectureNotes: [],
      commands: {},
      dangerousPaths: [],
      acceptanceCriteria: [],
    },
    policies: {
      worktrees: {
        mode: "auto",
        cleanup: "delete",
        keepFailed: true,
      },
      completion: {
        requireValidations: true,
        conventionalCommits: false,
      },
      riskyPaths: [],
    },
    validations: {
      typecheck: "bun run typecheck",
    },
    packs: {
      browser: {
        enabled: true,
        skills: [],
        validations: [],
        validationCommands: {},
        tools: { browser: true },
      },
    },
    routing: {
      roleSkills: {
        chef: ["verification-before-completion"],
        "sous-chef": ["verification-before-completion"],
        "line-cook": ["verification-before-completion"],
        expo: ["verification-before-completion"],
        critic: ["architecture-review"],
      },
      kindSkills: {
        repair: ["worktree-usage"],
        review: ["architecture-review"],
      },
      uiPackRoles: ["expo", "critic"],
    },
    ui: {
      theme: "yes-chef",
      streamMode: "events",
    },
  };
}
