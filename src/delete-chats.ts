import "dotenv/config";
import { installProcessTeardownGuards } from "./core/process-guard.ts";
import { deleteChatsForConfiguredAccounts } from "./services/chat-cleanup.ts";

installProcessTeardownGuards("DeleteChats");

async function run(): Promise<void> {
  console.log("🗑️  [DeleteChats] Using Playwright sessions");

  const result = await deleteChatsForConfiguredAccounts();
  console.log(
    `✅ [DeleteChats] Completed in ${result.mode} mode: ${result.succeeded}/${result.attempted} scope(s) cleared.`,
  );

  if (result.succeeded !== result.attempted) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(
    "[DeleteChats] Fatal error:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
