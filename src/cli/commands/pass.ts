import type { MenuRecord, RunRecord, ValidationRecord } from "../../core/models.ts";
import { daemonRequest } from "../client.ts";

interface PassResponse {
  menu: MenuRecord;
  validations: ValidationRecord[];
  reviews: RunRecord[];
  gates: {
    executionReady: boolean;
    validationsPassed: boolean;
    browserRequired: boolean;
    browserReady: boolean;
    reviewRequired: boolean;
    reviewPassed: boolean;
    conventionalCommitReady: boolean;
  };
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
  console.log(
    `Gates: execution=${result.gates.executionReady}, validations=${result.gates.validationsPassed}, browser=${result.gates.browserReady}${result.gates.browserRequired ? " (required)" : ""}, review=${result.gates.reviewPassed}, conventional=${result.gates.conventionalCommitReady}`,
  );
  if (result.reviews.length > 0) {
    console.log(`Reviews: ${result.reviews.map((review) => `${review.id}=${review.status}`).join(", ")}`);
  }
}
