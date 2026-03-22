# Yes Chef Repo Rules

## Mission

Build Yes Chef as a local-first coding-agent control plane where Yes Chef owns orchestration, state, event streaming, validation flow, and artifacts.

## Core rules

- Favor clarity and resumability over clever orchestration.
- Keep the public event protocol stable and independent from harness output.
- Treat SQLite plus on-disk artifacts as the source of truth for resumable state.
- Prefer sequential execution for write-heavy work in v1.
- Do not silently rewrite `AGENTS.md`; write suggested rule updates as draft patches.

## Build expectations

- Use Bun and TypeScript.
- Keep validation deterministic and shell-command-based.
- Preserve the kitchen metaphor structurally, not decoratively.
- Avoid adding GUI, hosted, mobile, or marketplace features to v1 work unless explicitly requested.

## Validation expectations

- Run `bun run typecheck` before shipping scaffold changes.
- Keep command output compact by default.
- Store logs and artifacts under `.yeschef/` and reference them from SQLite.
