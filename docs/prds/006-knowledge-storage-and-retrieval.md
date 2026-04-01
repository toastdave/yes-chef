# PRD 006: Knowledge Storage and Retrieval

## Status

Foundation in progress. The scaffold now has a local knowledge document table, SQLite FTS indexing, daemon endpoints for indexing and search, a CLI path for indexing and querying repo knowledge, source-filtered retrieval, a combined state-plus-knowledge lookup path, and first-pass use of retrieved knowledge during prep, review, repair, and runtime prompt construction. Remaining work is richer source coverage, better ranking, and optional semantic search.

## Problem

Yes Chef can orchestrate runs and persist menus, orders, and validations, but it has no structured way to ingest local documentation, search it efficiently, or distinguish stable project knowledge from runtime state and learned memory. Skills alone are not enough, and prompt-only context injection will not scale.

## Goal

Add a local-first knowledge layer that keeps structured operational state in SQLite, indexes text content with FTS5 for fast retrieval, supports optional semantic retrieval, and preserves portable source artifacts for recovery and inspection.

## Outcomes

- Structured Yes Chef state remains in SQLite for menus, orders, runs, validations, workspaces, and configuration snapshots.
- Knowledge documents from repo docs, PRDs, prompts, skill files, and project overlays are normalized into a searchable document store.
- Full-text retrieval uses SQLite FTS5 with BM25-style ranking for exact and keyword-heavy lookups.
- Semantic retrieval is optional and additive, not required for the first useful version.
- Retrieval can combine structured state lookups, FTS results, and semantic matches without collapsing them into one opaque store.
- Artifacts or JSONL exports remain available as durable source material for rebuilding indexes and reviewing historical context.
- Each indexed document keeps source metadata such as path, project, source type, tags, version hints, and updated time.

## Non-goals

- Hosted knowledge services in the first cut
- Mandatory embeddings for every project
- Automatic internet-wide documentation crawling

## Notes

- Model the system as four separate concepts: structured state, project knowledge, learned memory, and procedural skills.
- FTS5 should be the default retrieval engine for local docs because it is fast, cheap, explainable, and works offline.
- Semantic retrieval should be introduced only where fuzzy recall clearly improves outcomes.
- Retrieval results should carry source references so downstream prompts and reports can explain where context came from.
