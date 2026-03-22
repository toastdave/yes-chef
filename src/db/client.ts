import { Database } from "bun:sqlite";

import { resolveRuntimePaths } from "../core/fs.ts";

let cachedRoot: string | null = null;
let cachedDb: Database | null = null;

export function getDatabase(root = process.cwd()): Database {
  if (cachedDb && cachedRoot === root) {
    return cachedDb;
  }

  const paths = resolveRuntimePaths(root);
  cachedRoot = root;
  cachedDb = new Database(paths.dbPath);
  cachedDb.exec("PRAGMA journal_mode = WAL;");
  cachedDb.exec("PRAGMA foreign_keys = ON;");
  return cachedDb;
}
