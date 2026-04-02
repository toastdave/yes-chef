import { Database } from "bun:sqlite";
import { test, expect } from "bun:test";

import { schemaStatements } from "../db/schema.ts";
import { searchKnowledgeDocuments } from "./search.ts";

test("searchKnowledgeDocuments falls back to OR-style matches when strict AND misses", () => {
  const db = createKnowledgeDb();

  insertKnowledge(db, {
    id: "K-1",
    path: "docs/backend.md",
    sourceType: "project-doc",
    title: "Delegate backend notes",
    body: "Delegate mode keeps backend-native agents behind Yes Chef.",
  });
  insertKnowledge(db, {
    id: "K-2",
    path: "docs/browser.md",
    sourceType: "project-doc",
    title: "Browser pack notes",
    body: "Browser validation uses Expo and shell harnesses.",
  });

  const results = searchKnowledgeDocuments(db, "delegate browser", { limit: 5 });

  expect(results.length).toBe(2);
  expect(results.map((result) => result.id)).toEqual(["K-2", "K-1"]);
});

test("searchKnowledgeDocuments boosts repo rules and PRDs over generic docs", () => {
  const db = createKnowledgeDb();

  insertKnowledge(db, {
    id: "K-3",
    path: "README.md",
    sourceType: "project-doc",
    title: "Routing notes",
    body: "Routing must stay explainable and local-first.",
  });
  insertKnowledge(db, {
    id: "K-4",
    path: "docs/prds/007-skills-packs-and-routing.md",
    sourceType: "prd",
    title: "Routing PRD",
    body: "Routing must stay explainable and local-first.",
  });
  insertKnowledge(db, {
    id: "K-5",
    path: "AGENTS.md",
    sourceType: "repo-rules",
    title: "Repo rules",
    body: "Routing must stay explainable and local-first.",
  });

  const results = searchKnowledgeDocuments(db, "routing explainable local-first", { limit: 3 });

  expect(results.map((result) => result.id)).toEqual(["K-4", "K-5", "K-3"]);
});

function createKnowledgeDb(): Database {
  const db = new Database(":memory:");
  for (const statement of schemaStatements) {
    if (statement.includes("knowledge_documents") || statement.includes("knowledge_documents_fts")) {
      db.exec(statement);
    }
  }
  return db;
}

function insertKnowledge(db: Database, input: {
  id: string;
  path: string;
  sourceType: string;
  title: string;
  body: string;
}): void {
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO knowledge_documents (
      id, path, source_type, title, body, metadata_json, content_hash, updated_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.path,
    input.sourceType,
    input.title,
    input.body,
    JSON.stringify({}),
    `${input.id}-hash`,
    now,
    now,
  );
}
