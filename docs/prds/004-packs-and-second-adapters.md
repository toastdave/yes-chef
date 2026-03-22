# PRD 004: Packs and Multi-Adapter Expansion

## Problem

Yes Chef needs a path beyond the first Codex adapter without overbuilding v1.

## Goal

Expand the adapter model to support Claude and OpenCode while adding the first useful pack lifecycle hooks.

## Outcomes

- Shared adapter contract across Codex, Claude, and OpenCode.
- Pack resolution and activation hooks are passed into adapter execution.
- Browser pack remains optional and locally controlled.

## Non-goals

- Pack marketplace
- Dynamic installer system
- Hosted adapter registry
