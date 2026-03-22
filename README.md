# Yes Chef

Yes Chef is a local-first coding-agent control plane built around a daemon plus CLI. This repository contains the v1 Bun/TypeScript scaffold for config loading, event streaming, SQLite state, menu persistence, and a first Codex adapter stub.

## Commands

```bash
bun install
bun run daemon
bun run cli prep "Build the invite flow"
bun run cli status
bun run cli doctor
```

## Layout

- `src/cli`: thin CLI over the local daemon
- `src/daemon`: REST and SSE daemon skeleton
- `src/core`: config, ids, fs, and exec helpers
- `src/db`: SQLite schema and migrations
- `src/events`: stable Yes Chef event model and storage
- `src/orchestration`: menu, order, and service flows
- `src/adapters/codex`: first backend adapter stub
- `docs/prds`: future-work product requirement docs
