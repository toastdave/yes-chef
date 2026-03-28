# PRD 002: Critic Review and Stronger Pass Gates

## Status

Foundation in progress. Pass flow now supports policy-driven completion checks, optional conventional-commit gating, first-pass Critic review orders routed through configured agents, and repair handoff when review blocks shipping. The scaffold now also classifies review failures and carries targeted guidance into the repair loop. Remaining work is browser-oriented gates and deeper reviewer heuristics for higher-confidence triage.

## Problem

The current scaffold can run shell validations, but the final pass flow does not yet include a Critic review stage or richer approval states.

## Goal

Introduce a deterministic pass pipeline that combines validation gates, optional reviewer runs, and ready-for-merge decisions.

## Outcomes

- `yeschef pass` can require Expo and Critic stages.
- Menus end in `completed`, `blocked`, or `approval-required` with clear reasons.
- Review outputs become first-class artifacts and events.
- Expo and Critic execution should resolve through the configured Yes Chef agents, not hardcoded backends.
- Validation policies can require browser verification for UI work, stronger review for risky domains, and conventional-commit readiness checks before completion.
- Completion criteria should be explicit and machine-checkable so builder behavior can be enforced by Expo instead of buried in prompts.

## Non-goals

- Hosted code review dashboards
- GitHub merge automation in the first cut

## Notes

- Pass flow should respect agent-level permissions and backend overrides from the merged config.
- Browser-based validation should be attached to Expo or a future tester role, not enabled for every write-capable agent by default.
- Critic should review architecture fit, risky diffs, and policy compliance separately from shell validations.
