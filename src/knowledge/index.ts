import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import { createId } from "../core/ids.ts";
import type { KnowledgeDocumentRecord, KnowledgeIndexResult } from "./types.ts";

const allowedExtensions = new Set([".md", ".txt", ".json", ".jsonc", ".yaml", ".yml"]);

const rootFiles = ["README.md", "AGENTS.md", "yeschef.config.jsonc", "skills-lock.json"];
const rootedDirectories = ["docs", ".agents", "prompts", "src/prompts"];

interface KnowledgeRow {
  id: string;
  path: string;
  source_type: string;
  title: string;
  body: string;
  metadata_json: string;
  content_hash: string;
  updated_at: string;
  indexed_at: string;
}

export async function indexKnowledgeDocuments(db: Database, root: string): Promise<KnowledgeIndexResult> {
  const discovered = await discoverKnowledgeFiles(root);
  const existing = db.query(`SELECT * FROM knowledge_documents`).all() as KnowledgeRow[];
  const existingByPath = new Map(existing.map((row) => [row.path, row]));

  let indexed = 0;
  let skipped = 0;

  for (const filePath of discovered) {
    const relativePath = relative(root, filePath) || basename(filePath);
    const contents = await readFile(filePath, "utf8");
    const fileStat = await stat(filePath);
    const contentHash = createHash("sha256").update(contents).digest("hex");
    const existingRow = existingByPath.get(relativePath);

    if (existingRow && existingRow.content_hash === contentHash) {
      skipped += 1;
      existingByPath.delete(relativePath);
      continue;
    }

    const indexedAt = new Date().toISOString();
    const record: KnowledgeDocumentRecord = {
      id: existingRow?.id ?? createId("K"),
      path: relativePath,
      sourceType: classifySourceType(relativePath),
      title: deriveTitle(relativePath, contents),
      body: contents,
      metadata: {
        extension: extname(relativePath),
        filename: basename(relativePath),
      },
      contentHash,
      updatedAt: fileStat.mtime.toISOString(),
      indexedAt,
    };

    upsertKnowledgeDocument(db, record);
    indexed += 1;
    existingByPath.delete(relativePath);
  }

  let removed = 0;
  for (const stale of existingByPath.values()) {
    db.query(`DELETE FROM knowledge_documents WHERE id = ?`).run(stale.id);
    removed += 1;
  }

  return {
    indexed,
    skipped,
    removed,
    total: discovered.length,
  };
}

async function discoverKnowledgeFiles(root: string): Promise<string[]> {
  const files = new Set<string>();

  for (const file of rootFiles) {
    const candidate = join(root, file);
    if (await pathExists(candidate)) {
      files.add(candidate);
    }
  }

  for (const directory of rootedDirectories) {
    const candidate = join(root, directory);
    if (await pathExists(candidate)) {
      for (const child of await collectFiles(candidate)) {
        files.add(child);
      }
    }
  }

  return [...files].sort();
}

async function collectFiles(directory: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}

function upsertKnowledgeDocument(db: Database, record: KnowledgeDocumentRecord): void {
  db.query(
    `INSERT INTO knowledge_documents (
      id, path, source_type, title, body, metadata_json, content_hash, updated_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      source_type = excluded.source_type,
      title = excluded.title,
      body = excluded.body,
      metadata_json = excluded.metadata_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at,
      indexed_at = excluded.indexed_at`,
  ).run(
    record.id,
    record.path,
    record.sourceType,
    record.title,
    record.body,
    JSON.stringify(record.metadata),
    record.contentHash,
    record.updatedAt,
    record.indexedAt,
  );
}

function classifySourceType(filePath: string): string {
  if (filePath === "AGENTS.md") return "repo-rules";
  if (filePath === "README.md") return "project-doc";
  if (filePath === "yeschef.config.jsonc") return "project-config";
  if (filePath === "skills-lock.json") return "skill-lock";
  if (filePath.startsWith("docs/prds/")) return "prd";
  if (filePath.startsWith("docs/")) return "doc";
  if (filePath.startsWith(".agents/")) return "agent";
  if (filePath.startsWith("src/prompts/") || filePath.startsWith("prompts/")) return "prompt";
  return "knowledge";
}

function deriveTitle(filePath: string, contents: string): string {
  const firstHeading = contents.split(/\r?\n/).find((line) => line.startsWith("# "));
  if (firstHeading) {
    return firstHeading.slice(2).trim();
  }

  return basename(filePath);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
