# PRD 004: Config Layering and Agent Setup

## Status

Core foundation implemented in the scaffold. Merged config loading, built-in agent defaults, global setup, role-to-agent mapping, policies, skills, packs, routing hints, and project overlays now exist. Remaining work is richer config validation, stronger authoring ergonomics, and optional markdown-driven authoring for prompts or skills.

## Problem

The current scaffold only supports a single project-local config file and hardcoded role defaults. It does not provide a global config, merged precedence, a setup flow, or a configurable Yes Chef agent registry.

## Goal

Add an OpenCode-style configuration system for Yes Chef with built-in agents, global and project overrides, and a `yeschef setup` command that prepares a machine for first use while leaving room for policies, skills, packs, routing, and project-scoped knowledge overlays.

## Outcomes

- Config precedence is: built-in defaults, global config, custom override path, project config, then CLI flags.
- `yeschef setup` detects installed CLIs, lets the user choose enabled backends, picks a default backend and model, and writes the global config.
- If no supported CLI is installed, setup recommends installing `opencode` and defaults to an OpenCode free model after install.
- Built-in Yes Chef agents (`chef`, `sous-chef`, `line-cook`, `expo`, `critic`) inherit the global default backend and model unless explicitly overridden.
- Users can define or override any agent in config with fields like `role`, `backend`, `model`, `prompt`, `tools` or permissions, and optional backend-native bindings.
- Project config overrides global agent definitions cleanly without replacing unrelated settings.
- Agent definitions can now carry prompt, tools, permissions, mode, and optional backend-native bindings.
- Config can define global policies such as validation-before-completion, worktree requirements, and commit conventions separately from agent prompts.
- Config can declare skills, packs, routing hints, and project knowledge sources without forcing those concerns into every agent definition.
- Project config can supply architecture maps, repo commands, dangerous paths, and acceptance criteria as project-scoped overlays rather than global defaults.

## Non-goals

- Remote organizational config in the first cut
- A graphical config editor
- Markdown-based agent files in the first pass
- Auto-importing backend-native agents into the Yes Chef registry

## Notes

- Favor JSONC first so config merging and validation stay predictable.
- Treat Yes Chef agents as the stable user-facing abstraction and backend-native agents as adapter details.
- `yeschef doctor` should explain both raw availability and effective resolved defaults.
- Keep role definitions small and stable; most specialization should live in skills, packs, and project overlays.
- Remaining follow-up work should focus on config validation, richer examples, and optional markdown-based authoring for prompts or skills if still desired.
