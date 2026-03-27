#!/usr/bin/env bun

import { logError } from "../core/logger.ts";
import { runDoctorCommand } from "./commands/doctor.ts";
import { runFireCommand } from "./commands/fire.ts";
import { runKnowledgeCommand } from "./commands/knowledge.ts";
import { runLookupCommand } from "./commands/lookup.ts";
import { runLogsCommand } from "./commands/logs.ts";
import { runPassCommand } from "./commands/pass.ts";
import { runPrepCommand } from "./commands/prep.ts";
import { runSetupCommand } from "./commands/setup.ts";
import { runStatusCommand } from "./commands/status.ts";

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "prep":
      await runPrepCommand(args);
      break;
    case "fire":
      await runFireCommand(args);
      break;
    case "pass":
      await runPassCommand(args);
      break;
    case "status":
      await runStatusCommand();
      break;
    case "setup":
      await runSetupCommand(args);
      break;
    case "logs":
      await runLogsCommand(args);
      break;
    case "lookup":
      await runLookupCommand(args);
      break;
    case "knowledge":
      await runKnowledgeCommand(args);
      break;
    case "doctor":
      await runDoctorCommand();
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp(): void {
  console.log(`Yes Chef

Commands:
  yeschef prep "<goal>"
  yeschef fire <menu-id>
  yeschef pass <menu-id>
  yeschef status
  yeschef setup
  yeschef logs <run-id>
  yeschef lookup <query>
  yeschef knowledge index
  yeschef knowledge search <query>
  yeschef doctor`);
}
