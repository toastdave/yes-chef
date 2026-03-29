export type RoleName = "chef" | "sous-chef" | "line-cook" | "expo" | "critic";

export type MenuStatus = "draft" | "prepared" | "running" | "blocked" | "ready" | "completed";
export type OrderKind = "prep" | "implement" | "validate" | "review" | "repair" | "rules-update" | "merge";
export type OrderStatus = "pending" | "queued" | "running" | "completed" | "failed" | "blocked";
export type RunStatus = "running" | "completed" | "failed";
export type WorkspaceStatus = "attached" | "ready" | "locked" | "released";
export type WorkspaceStrategy = "in-place" | "worktree";
export type WorkspaceCleanupStatus = "kept" | "removed";
export type ValidationStatus = "pending" | "running" | "passed" | "failed";
export type ArtifactType =
  | "stdout_log"
  | "stderr_log"
  | "plan"
  | "menu"
  | "diff"
  | "validation_output"
  | "screenshot"
  | "trace"
  | "summary"
  | "rules_patch";

export interface CourseRecord {
  id: string;
  menuId: string;
  title: string;
  summary: string;
  status: string;
  orderIds: string[];
}

export interface MenuRecord {
  id: string;
  title: string;
  objective: string;
  contextSummary: string;
  courses: CourseRecord[];
  dishes: string[];
  orders: string[];
  validations: string[];
  risks: string[];
  requiredPacks: string[];
  status: MenuStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRecord {
  id: string;
  menuId: string;
  title: string;
  kind: OrderKind;
  role: RoleName;
  agentId: string;
  backend: string;
  model: string;
  mode: "managed" | "delegate";
  backendAgent: string | null;
  repairForOrderId: string | null;
  sourceRunId: string | null;
  retryCount: number;
  failureContext: Record<string, unknown>;
  isolationStrategy: WorkspaceStrategy;
  isolationReason: string;
  profile: string;
  promptTemplate: string;
  tools: Record<string, unknown>;
  permissions: Record<string, unknown>;
  workspaceId: string | null;
  dependsOn: string[];
  packs: string[];
  skills: string[];
  routingReasons: string[];
  knowledgeSources: string[];
  overlayContext: Record<string, unknown>;
  validationsRequired: string[];
  retryLimit: number;
  status: OrderStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  orderId: string;
  role: RoleName;
  agentId: string;
  backend: string;
  model: string;
  mode: "managed" | "delegate";
  backendAgent: string | null;
  command: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  summary: string | null;
  artifactIds: string[];
  routingContext: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRecord {
  id: string;
  orderId: string;
  path: string;
  branchName: string;
  baseBranch: string;
  baseRevision: string;
  strategy: WorkspaceStrategy;
  cleanupStatus: WorkspaceCleanupStatus;
  isolationReason: string;
  locked: boolean;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  type: ArtifactType;
  path: string;
  metadataJson: string;
  createdAt: string;
}

export interface ValidationRecord {
  id: string;
  menuId: string;
  orderId: string | null;
  runId: string | null;
  name: string;
  command: string;
  status: ValidationStatus;
  outputPath: string | null;
  startedAt: string;
  endedAt: string | null;
}

export function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
