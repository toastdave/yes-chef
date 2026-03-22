# PRD 003: Interactive Service Board

## Problem

The default CLI should stay compact, but operators will want a richer live board for active menus, orders, validations, and logs.

## Goal

Add an optional full-screen terminal experience on top of the stable daemon API and SSE event stream.

## Outcomes

- Interactive watch mode for status and logs.
- Clear kitchen phases mapped from raw event types.
- Better visibility into active runs, blocked orders, and artifacts.

## Candidate tools

- Evaluate `trendr` or a similarly lightweight TUI renderer after the core loop is stable.
