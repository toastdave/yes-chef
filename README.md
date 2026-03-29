# Yes Chef

Yes Chef is a local-first coding-agent control plane built around a daemon plus CLI. This repository contains the v1 Bun/TypeScript scaffold for config loading, event streaming, SQLite state, menu persistence, and a first Codex adapter stub.

## Commands

```bash
bun install
bun run cli setup
bun run daemon
bun run cli prep "Build the invite flow"
bun run cli status
bun run cli lookup "repair critic"
bun run cli knowledge index
bun run cli knowledge search "worktree retry"
bun run cli doctor
```

## Config precedence

- Built-in Yes Chef defaults
- Global config at `~/.config/yeschef/config.jsonc`
- Optional override path from `YESCHEF_CONFIG`
- Project config from the nearest `yeschef.config.jsonc`

Built-in agents inherit the global default backend and model unless a project or agent override says otherwise.
When the effective backend is `auto`, Yes Chef picks the best installed CLI for the model family: GPT prefers `codex` then `opencode`, Anthropic uses `claude`, Gemini prefers `gemini` then `opencode`, and generic models fall back to `opencode`.

## Policies

The scaffold now supports minimal policy controls in config.

- `policies.worktrees.mode`: `off`, `auto`, or `required`
- `policies.worktrees.cleanup`: keep or delete successful isolated worktrees
- `policies.worktrees.keepFailed`: keep failed isolated worktrees for inspection
- `policies.completion.requireValidations`: require Expo validations before completion
- `policies.completion.conventionalCommits`: reserve a place for conventional-commit gating in later pass flows

`yeschef pass` now uses those policies to run deterministic validation gates and, when review is required by the active mode, dispatch a Critic review order through the configured agent/backend.
When Critic fails, Yes Chef now classifies the review failure, looks up related state and knowledge, and hands that guidance back into the repair loop so the next implementation order carries reviewer context instead of only raw harness logs.

## Knowledge

- `yeschef knowledge index` refreshes the local document index from repo rules, PRDs, prompts, config, and agent files
- `yeschef knowledge search "..." --source prd` runs SQLite FTS search over the indexed knowledge store with optional source filters
- `yeschef lookup "..."` combines runtime state search with knowledge search so orders, runs, workspaces, validations, and docs can be searched together
- `yeschef prep` refreshes the index before creating a menu so planning has fresh local context available
- implementation, review, and repair prompts now pull top local knowledge hits into their execution brief automatically

## Skills And Packs

- Yes Chef now resolves skills, packs, routing reasons, and knowledge sources per order
- Built-in skills cover verification, debugging, worktree usage, frontend design, browser QA, and architecture review
- Packs can add skills, validations, tools, and permissions as capability bundles
- Routing stays explainable through order metadata, prompts, logs, and status output

## Custom agents

Project and global config can define custom agents and map them to roles.

```jsonc
{
  "agents": {
    "custom-cook": {
      "role": "line-cook",
      "backend": "auto",
      "model": "gpt-5-codex",
      "mode": "delegate",
      "backendAgent": "build",
      "prompt": "custom-line-cook",
      "tools": {
        "write": true,
        "bash": true
      },
      "permissions": {
        "bash": {
          "*": "allow"
        }
      }
    }
  },
  "roleDefaults": {
    "line-cook": "custom-cook"
  },
  "backends": {
    "opencode": {
      "command": "opencode",
      "managedArgs": [],
      "delegateArgs": []
    }
  }
}
```

Use `managedArgs` and `delegateArgs` in backend config when a CLI needs different invocation templates for Yes Chef-managed prompts versus backend-native delegation.

## Layout

- `src/cli`: thin CLI over the local daemon
- `src/daemon`: REST and SSE daemon skeleton
- `src/core`: config, ids, fs, and exec helpers
- `src/db`: SQLite schema and migrations
- `src/events`: stable Yes Chef event model and storage
- `src/orchestration`: menu, order, and service flows
- `src/adapters/codex`: first backend adapter stub
- `docs/prds`: future-work product requirement docs
