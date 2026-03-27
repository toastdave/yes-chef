import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { EVENT_LOG_FILE_NAME } from "./constants.ts";

export interface RuntimePaths {
  root: string;
  runtimeRoot: string;
  dbDir: string;
  runsDir: string;
  menusDir: string;
  workspacesDir: string;
  artifactsDir: string;
  promptsDir: string;
  patchesDir: string;
  knowledgeDir: string;
  dbPath: string;
  eventLogPath: string;
}

export function resolveRuntimePaths(root = process.cwd()): RuntimePaths {
  const runtimeRoot = join(root, ".yeschef");

  return {
    root,
    runtimeRoot,
    dbDir: join(runtimeRoot, "db"),
    runsDir: join(runtimeRoot, "runs"),
    menusDir: join(runtimeRoot, "menus"),
    workspacesDir: join(runtimeRoot, "workspaces"),
    artifactsDir: join(runtimeRoot, "artifacts"),
    promptsDir: join(runtimeRoot, "prompts"),
    patchesDir: join(runtimeRoot, "patches"),
    knowledgeDir: join(runtimeRoot, "knowledge"),
    dbPath: join(runtimeRoot, "db", "yeschef.sqlite"),
    eventLogPath: join(runtimeRoot, "runs", EVENT_LOG_FILE_NAME),
  };
}

export async function ensureRuntimePaths(root = process.cwd()): Promise<RuntimePaths> {
  const paths = resolveRuntimePaths(root);

  await Promise.all([
    mkdir(paths.dbDir, { recursive: true }),
    mkdir(paths.runsDir, { recursive: true }),
    mkdir(paths.menusDir, { recursive: true }),
    mkdir(paths.workspacesDir, { recursive: true }),
    mkdir(paths.artifactsDir, { recursive: true }),
    mkdir(paths.promptsDir, { recursive: true }),
    mkdir(paths.patchesDir, { recursive: true }),
    mkdir(paths.knowledgeDir, { recursive: true }),
  ]);

  return paths;
}

export async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextFile(filePath: string, value: string): Promise<void> {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, value, "utf8");
}

export async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await ensureParentDirectory(filePath);
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
