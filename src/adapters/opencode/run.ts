import type { YesChefConfig } from "../../core/config.ts";
import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../../core/models.ts";
import type { EventBus } from "../../events/emit.ts";
import type { KnowledgeContext } from "../../knowledge/context.ts";
import { runCliAdapter, type AdapterRunResult } from "../shared/run.ts";

export async function runOpenCodeAdapter(options: {
  root: string;
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  workspace: WorkspaceRecord;
  runId: string;
  bus: EventBus;
  knowledge?: KnowledgeContext;
}): Promise<AdapterRunResult> {
  return runCliAdapter({
    ...options,
    adapterName: "opencode",
  });
}
