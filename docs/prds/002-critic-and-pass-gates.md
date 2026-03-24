# PRD 002: Critic Review and Stronger Pass Gates

## Problem

The current scaffold can run shell validations, but the final pass flow does not yet include a Critic review stage or richer approval states.

## Goal

Introduce a deterministic pass pipeline that combines validation gates, optional reviewer runs, and ready-for-merge decisions.

## Outcomes

- `yeschef pass` can require Expo and Critic stages.
- Menus end in `completed`, `blocked`, or `approval-required` with clear reasons.
- Review outputs become first-class artifacts and events.
- Expo and Critic execution should resolve through the configured Yes Chef agents, not hardcoded backends.

## Non-goals

- Hosted code review dashboards
- GitHub merge automation in the first cut

## Notes

- Pass flow should respect agent-level permissions and backend overrides from the merged config.
