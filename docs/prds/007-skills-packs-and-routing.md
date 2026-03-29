# PRD 007: Skills, Packs, and Routing

## Status

Foundation in progress. The scaffold now has built-in skill definitions, richer pack metadata, deterministic routing resolution, persisted routing reasons on orders and runs, pack-aware adapter invocation via env and trace artifacts, and first-pass project overlays for repo maps, dangerous paths, commands, and acceptance criteria. Remaining work is richer routing heuristics and more advanced pack activation behavior.

## Problem

Today Yes Chef can choose an agent, backend, and model, but it cannot reliably decide which reusable workflows, project overlays, or capability bundles should accompany a task. That leaves important behavior buried in prompts or ad hoc agent definitions.

## Goal

Introduce first-class skills, richer packs, and explicit routing logic so Yes Chef can choose the right workflows and context for each order based on task intent, repo signals, risk, and available backend capabilities.

## Outcomes

- Skills are modeled as reusable procedural guidance with metadata such as summary, when-to-use rules, required tools, related stacks, and completion checklists.
- Packs evolve from booleans into capability bundles that can attach multiple skills, validations, and tool requirements to an order.
- Routing can combine task shape, repo signals, project overlays, and backend capability data when resolving an order.
- Built-in roles stay stable (`chef`, `sous-chef`, `line-cook`, `expo`, `critic`) while specialization mostly lives in skills and packs.
- Global skills can cover workflows like verification-before-completion, systematic debugging, worktree usage, browser QA, and frontend design.
- Project-scoped overlays can attach repo maps, architecture notes, commands, dangerous paths, and acceptance criteria without polluting global defaults.
- Orders persist the selected skills, packs, routing reasons, and knowledge sources so later retries and reviews can reconstruct why a run behaved the way it did.

## Non-goals

- A public marketplace in the first cut
- Automatic installation of third-party skills from arbitrary URLs
- Dozens of narrowly scoped builtin specialist roles

## Notes

- Prefer a small stable agent set with richer routing over a large set of overlapping agent personas.
- Treat policies as mandatory rules, skills as workflows, and packs as convenience bundles that can compose both.
- Routing should be explainable in logs and artifacts so operators can see why a given skill set or backend was chosen.
- Browser automation should usually be routed to Expo or future tester-oriented flows instead of every write-capable order.
