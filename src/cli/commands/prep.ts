import type { MenuRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";

interface PrepResponse {
  menu: MenuRecord;
  orderCount: number;
}

export async function runPrepCommand(args: string[]): Promise<void> {
  const goal = args.join(" ").trim();

  if (!goal) {
    throw new Error("Usage: yeschef prep \"<goal>\"");
  }

  const result = await daemonRequest<PrepResponse>("/menus", {
    method: "POST",
    body: JSON.stringify({ goal }),
  });

  console.log(`Prepared ${result.menu.id} for ${result.menu.objective}`);
  console.log(`Orders queued: ${result.orderCount}`);
  console.log(`Artifacts: .yeschef/menus/${result.menu.id}`);
}
