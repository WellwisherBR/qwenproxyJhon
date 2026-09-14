import {
  getAccountCredentials,
  loadAccounts,
  type QwenAccount,
} from "../core/accounts.ts";
import { deleteAllQwenChats } from "./qwen.ts";
import {
  initPlaywrightForAccount,
  isPlaywrightInitialized,
  closeAllPlaywright,
} from "./playwright.ts";
import { isAuthMockEnabled } from "./auth-playwright.ts";
import { maskEmail } from "../core/logger.ts";
export interface DeleteChatsResult {
  attempted: number;
  succeeded: number;
  mode: "accounts";
}

async function ensurePlaywrightSession(
  account: QwenAccount,
  index = 1,
  total = 1,
): Promise<void> {
  if (isPlaywrightInitialized(account.id) || isAuthMockEnabled()) return;

  const credentials = getAccountCredentials(account.id);
  if (!credentials) {
    throw new Error(`Credenciais da conta ${account.id} não encontradas.`);
  }

  console.log(
    `[DeleteChats] [${index}/${total}] Abrindo navegador para ${maskEmail(account.email)}...`,
  );
  await initPlaywrightForAccount(credentials, true, "chromium", {
    skipHeaderCapture: true,
  });
  console.log(
    `✅ [DeleteChats] [${index}/${total}] Sessão pronta para ${maskEmail(account.email)}.`,
  );
}

export async function deleteChatsForAccount(
  account: QwenAccount,
  index = 1,
  total = 1,
): Promise<boolean> {
  await ensurePlaywrightSession(account, index, total);
  console.log(
    `🗑️  [DeleteChats] [${index}/${total}] Apagando conversas remotas de ${maskEmail(account.email)}...`,
  );
  const ok = await deleteAllQwenChats(account.id);
  if (ok) {
    console.log(
      `✅ [DeleteChats] [${index}/${total}] Conversas apagadas com sucesso para ${maskEmail(account.email)}.`,
    );
  }
  return ok;
}

export async function deleteChatsForAccountId(accountId: string): Promise<boolean> {
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`Conta ${accountId} não encontrada.`);
  }
  const credentials = getAccountCredentials(account.id);
  if (!credentials) {
    throw new Error(`Credenciais da conta ${account.email} não encontradas.`);
  }
  return deleteChatsForAccount(credentials);
}

export async function deleteChatsForConfiguredAccounts(keepBrowserOpen = false): Promise<DeleteChatsResult> {
  // Playwright requests are account-scoped. Use every account persisted in the
  // database, including accounts created through `npm run login`, instead of
  // falling back to a global request without an account context.
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    throw new Error(
      "No Qwen accounts configured. Add an account with npm run login.",
    );
  }

  let succeeded = 0;

  try {
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const currentIdx = i + 1;
      const totalCount = accounts.length;
      try {
        const ok = await deleteChatsForAccount(account, currentIdx, totalCount);
        if (ok) succeeded++;
      } catch (error) {
        console.error(
          `❌ [DeleteChats] [${currentIdx}/${totalCount}] Falha ao apagar conversas de ${maskEmail(account.email)}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } finally {
    if (!keepBrowserOpen) {
      await closeAllPlaywright().catch((error) => {
        console.warn(
          `[DeleteChats] Failed to close Playwright sessions:`,
          error instanceof Error ? error.message : String(error),
        );
      });
    }
  }

  return {
    attempted: accounts.length,
    succeeded,
    mode: "accounts",
  };
}
