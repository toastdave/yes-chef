import { ensureRuntimePaths } from "../core/fs.ts";
import { getDatabase } from "./client.ts";
import { schemaStatements } from "./schema.ts";

export async function migrateDatabase(root = process.cwd()): Promise<void> {
  await ensureRuntimePaths(root);
  const db = getDatabase(root);

  for (const statement of schemaStatements) {
    db.exec(statement);
  }
}
