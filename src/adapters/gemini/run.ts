import type { YesChefConfig } from "../../core/config.ts";
import type { MenuRecord, OrderRecord, WorkspaceRecord } from "../../core/models.ts";
import type { EventBus } from "../../events/emit.ts";
import { runCliAdapter, type AdapterRunResult } from "../shared/run.ts";

export async function runGeminiAdapter(options: {
  root: string;
  config: YesChefConfig;
  menu: MenuRecord;
  order: OrderRecord;
  workspace: WorkspaceRecord;
  runId: string;
  bus: EventBus;
}): Promise<AdapterRunResult> {
  return runCliAdapter({
    ...options,
    adapterName: "gemini",
  });
}
