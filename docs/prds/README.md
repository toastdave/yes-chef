# Yes Chef PRDs

These PRDs capture the planned next layers of the local-first Yes Chef runtime.

## Current focus

1. `docs/prds/004-config-and-agent-setup.md`
2. `docs/prds/005-backend-selection-and-adapter-delegation.md`

## Follow-on work

1. `docs/prds/001-worktree-and-retry-loop.md`
2. `docs/prds/002-critic-and-pass-gates.md`
3. `docs/prds/003-interactive-service-board.md`

## Planning notes

- The next implementation phase should establish config precedence, built-in agent defaults, and machine setup before broadening adapter behavior.
- Multi-adapter routing should follow the new agent/config model rather than introducing backend-specific concepts directly into orders or menus.
