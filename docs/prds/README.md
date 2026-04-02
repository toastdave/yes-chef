# Yes Chef PRDs

These PRDs capture the planned next layers of the local-first Yes Chef runtime.

## Current focus

1. `docs/prds/002-critic-and-pass-gates.md`
2. `docs/prds/005-backend-selection-and-adapter-delegation.md`
3. `docs/prds/006-knowledge-storage-and-retrieval.md`
4. `docs/prds/007-skills-packs-and-routing.md`

## Near-term follow-on work

1. `docs/prds/004-config-and-agent-setup.md`
2. `docs/prds/001-worktree-and-retry-loop.md`

## Later work

1. `docs/prds/003-interactive-service-board.md`

## Planning notes

- Config layering, multi-adapter routing, worktree isolation, pass-gate foundations, knowledge retrieval, and skill-pack routing now exist in the scaffold, and browser-validation plus backend-capability reporting now have first-pass plumbing, including conservative capability-aware backend rerouting for auto-selected orders, so the next implementation phase should focus on stronger default browser harnesses, richer retrieval quality, and deeper routing heuristics.
- Browser validation now has shell-based artifact and summary plumbing, so the next browser milestone is a stronger default harness story rather than more placeholder gating.
- The dependency-aware implementation order should be: real browser validation first, adapter capability contracts second, retrieval quality third, and routing heuristics fourth.
- Config validation and stronger planning ergonomics should tighten next so setup, routing, and menu generation all validate the same policy model.
- Yes Chef should remain the orchestration and policy plane; backend CLIs such as OpenCode should stay interchangeable execution engines.
- Skills, project knowledge, memory, and policy should be modeled as separate concepts so retrieval and validation remain predictable.
- Backend-native delegation should keep evolving behind the stable Yes Chef agent model rather than leaking harness-specific concepts into menus or status views.
