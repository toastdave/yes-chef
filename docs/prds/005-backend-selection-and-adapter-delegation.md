# PRD 005: Backend Selection and Adapter Delegation

## Status

Core groundwork implemented. Orders now resolve backends by model family, dispatch routes across multiple adapters, and delegate mode is represented in persisted state. Remaining work is backend-specific invocation polish and deeper native-agent integrations.

## Problem

The current scaffold is effectively Codex-only at dispatch time. It cannot resolve the best available backend, route by model family, or safely delegate to backend-native agents without leaking backend-specific behavior into Yes Chef.

## Goal

Introduce a shared adapter contract with explicit backend selection, model-family fallback rules, and optional delegation to native backend agents while keeping Yes Chef in control of orchestration, state, and events.

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

## Non-goals

- Automatic discovery and import of native Codex, Claude, or OpenCode agents
- Provider-level billing or account management
- Remote adapter registries

## Notes

- Yes Chef should persist the resolved agent, backend, model, and delegation mode on each order and run.
- Native backend agent names should stay explicit adapter references so naming collisions do not affect Yes Chef agents.
- Adapter behavior should remain resumable from stored DB state and artifacts.
- Remaining work should focus on backend-specific managed versus delegate argument templates, native profile support where available, and better artifact/log introspection.
