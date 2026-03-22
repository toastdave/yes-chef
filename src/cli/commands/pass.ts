import type { MenuRecord, ValidationRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";

interface PassResponse {
  menu: MenuRecord;
  validations: ValidationRecord[];
}

export async function runPassCommand(args: string[]): Promise<void> {
  const menuId = args[0];

  if (!menuId) {
    throw new Error("Usage: yeschef pass <menu-id>");
  }

  const result = await daemonRequest<PassResponse>(`/menus/${menuId}/pass`, {
    method: "POST",
  });

  console.log(`Pass checked for ${result.menu.id}`);
  console.log(`Status: ${result.menu.status}`);
  console.log(`Validations: ${result.validations.map((validation) => `${validation.name}=${validation.status}`).join(", ")}`);
}
