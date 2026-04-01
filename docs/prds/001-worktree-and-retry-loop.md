# PRD 001: Worktrees and Scoped Repair Orders

## Status

Core groundwork implemented. Policy-driven worktree selection, isolated git worktree creation, workspace cleanup behavior, repair-order scheduling, and retry lineage persistence now exist in the scaffold. Remaining work is richer retry context, smarter duplicate suppression and escalation, and cleaner operator UX around retries and workspace inspection.

## Problem

The v1 scaffold can track workspace metadata, but it does not yet create isolated git worktrees or generate targeted repair orders after failed validations.

## Goal

Add reliable worktree creation, locking, cleanup, and retry scheduling so failed orders can be repaired with only the relevant context.

## Outcomes

- Each write-capable order can run in an isolated worktree.
- Worktree use is policy-driven rather than universal: single low-risk edits may stay in-place, while parallel, high-risk, or long-running orders require isolation.
- Validation failures create repair orders instead of rerunning the full menu.
- Retry payloads include failing outputs, changed files, and acceptance criteria.
- Repair orders preserve the resolved Yes Chef agent, backend, and model context from the failed run.
- Worktree state captures which branch, base revision, and artifacts were used for each order so reruns and human inspection stay reproducible.

## Non-goals

- Distributed workers
- Remote sandboxes
- Automatic merge conflict resolution

## Notes

- Keep write execution sequential by default.
- Persist worktree lifecycle and retry lineage in SQLite.
- Keep worktree behavior independent from backend-specific workspace features.
- Worktree policy should be configurable globally and per project so repos can opt into stricter isolation.
