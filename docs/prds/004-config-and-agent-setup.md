# PRD 004: Config Layering and Agent Setup

## Problem

The current scaffold only supports a single project-local config file and hardcoded role defaults. It does not provide a global config, merged precedence, a setup flow, or a configurable Yes Chef agent registry.

## Goal

Add an OpenCode-style configuration system for Yes Chef with built-in agents, global and project overrides, and a `yeschef setup` command that prepares a machine for first use.

## Outcomes

- Config precedence is: built-in defaults, global config, custom override path, project config, then CLI flags.
- `yeschef setup` detects installed CLIs, lets the user choose enabled backends, picks a default backend and model, and writes the global config.
- If no supported CLI is installed, setup recommends installing `opencode` and defaults to an OpenCode free model after install.
- Built-in Yes Chef agents (`chef`, `sous-chef`, `line-cook`, `expo`, `critic`) inherit the global default backend and model unless explicitly overridden.
- Users can define or override any agent in config with fields like `role`, `backend`, `model`, `prompt`, `tools` or permissions, and optional backend-native bindings.
- Project config overrides global agent definitions cleanly without replacing unrelated settings.

## Non-goals

- Remote organizational config in the first cut
- A graphical config editor
- Markdown-based agent files in the first pass
- Auto-importing backend-native agents into the Yes Chef registry

## Notes

- Favor JSONC first so config merging and validation stay predictable.
- Treat Yes Chef agents as the stable user-facing abstraction and backend-native agents as adapter details.
- `yeschef doctor` should explain both raw availability and effective resolved defaults.
