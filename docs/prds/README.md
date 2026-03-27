# Yes Chef PRDs

These PRDs capture the planned next layers of the local-first Yes Chef runtime.

## Current focus

1. `docs/prds/001-worktree-and-retry-loop.md`
2. `docs/prds/002-critic-and-pass-gates.md`
3. `docs/prds/006-knowledge-storage-and-retrieval.md`

## Follow-on work

1. `docs/prds/003-interactive-service-board.md`
2. `docs/prds/004-config-and-agent-setup.md`
3. `docs/prds/005-backend-selection-and-adapter-delegation.md`
4. `docs/prds/007-skills-packs-and-routing.md`

## Planning notes

- Config layering, multi-adapter routing, worktree isolation, pass-gate foundations, and first-pass knowledge indexing now exist in the scaffold, so the next implementation phase should focus on strengthening review heuristics, broadening retrieval quality, and connecting knowledge more directly to planning and repair flows.
- Yes Chef should remain the orchestration and policy plane; backend CLIs such as OpenCode should stay interchangeable execution engines.
- Skills, project knowledge, memory, and policy should be modeled as separate concepts so retrieval and validation remain predictable.
- Backend-native delegation should keep evolving behind the stable Yes Chef agent model rather than leaking harness-specific concepts into menus or status views.
