# PRD 005: Backend Selection and Adapter Delegation

## Status

Core groundwork implemented. Orders now resolve backends by model family, dispatch routes across multiple adapters, delegate mode is represented in persisted state, pack-aware adapter invocation reaches the backend through env, placeholders, and routing trace artifacts, explicit capability reporting now exists on backend availability, resolved agents, doctor output, routing reasons, and pass gate summaries, auto-selected orders can now reroute toward backends whose advertised capabilities better fit the task, and successful runs now feed lightweight runtime capability observations back into future auto-routing. Remaining work is backend-specific invocation polish, richer runtime detection, and deeper native-agent integrations.

## Problem

The current scaffold is effectively Codex-only at dispatch time. It cannot resolve the best available backend, route by model family, or safely delegate to backend-native agents without leaking backend-specific behavior into Yes Chef.

## Goal

Introduce a shared adapter contract with explicit backend selection, model-family fallback rules, and optional delegation to native backend agents while keeping Yes Chef in control of orchestration, state, events, and policy.

## Outcomes

- Dispatch resolves a backend per Yes Chef agent instead of assuming Codex.
- Managed execution is the default: Yes Chef owns prompts, artifacts, and event normalization.
- Delegate execution is opt-in: a Yes Chef agent can reference a backend-native profile or agent without changing Yes Chef's public agent model.
- Model-family fallback rules are supported for `auto` backend selection.
- Initial fallback behavior follows product policy:
  - GPT-style models prefer `codex`, then `opencode`
  - Anthropic models use `claude`
  - Gemini models prefer `gemini`, then `opencode`
  - Unknown or generic cases fall back to `opencode`
- Pack resolution hooks can be passed into adapters without requiring a full marketplace.
- Adapter contracts describe tool surfaces, browser support, patching/edit behavior, and delegation constraints so routing can choose a backend with intent instead of model name alone.
- Capability contracts are available to routing, doctor, and pass planning as explicit Yes Chef fields rather than adapter-specific assumptions.
- Capability resolution can merge static config with lightweight runtime detection without leaking backend-native terms into the public agent model.
- OpenCode should remain a first-class managed backend for direct execution even when other CLIs are available for delegated specialist runs.

## Non-goals

- Automatic discovery and import of native Codex, Claude, or OpenCode agents
- Provider-level billing or account management
- Remote adapter registries

## Notes

- Yes Chef should persist the resolved agent, backend, model, and delegation mode on each order and run.
- Native backend agent names should stay explicit adapter references so naming collisions do not affect Yes Chef agents.
- Adapter behavior should remain resumable from stored DB state and artifacts.
- Backend-native capabilities should stay behind the adapter boundary; menus, orders, reviews, and knowledge retrieval should continue to speak in Yes Chef concepts.
- Remaining work should focus on richer runtime detection for capability reports, backend-specific managed versus delegate argument templates, native profile support where available, and better artifact or log introspection.
- Capability-aware rerouting should prefer model-family chain order first, then broader installed backends, while keeping explicit backend bindings stable.
