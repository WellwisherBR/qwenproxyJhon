import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ClientSyncResult, SyncOptions } from "./types.ts";
import { createTimestampBackup, restoreFromBackup } from "./utils.ts";

const TARGET_KEYS = [
  "saoudrizwan.claude-dev",
  "ZooCodeOrganization.zoo-code",
  "RooVeterinaryInc.roo-cline",
];

export function syncCline(options: SyncOptions): ClientSyncResult {
  const { filePath, baseUrl, model = "qwen3.8-max", reasoningEffort = "high" } = options;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let backupPath: string | undefined;
    if (fs.existsSync(filePath)) {
      backupPath = createTimestampBackup(filePath);
    }

    const db = new Database(filePath);
    db.exec(`CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value TEXT)`);

    const selectStmt = db.prepare(`SELECT value FROM ItemTable WHERE key = ?`);
    const insertStmt = db.prepare(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`);

    const updateConfig = (existingVal?: string): string => {
      let parsed: Record<string, any> = {};
      if (existingVal) {
        try {
          parsed = JSON.parse(existingVal);
        } catch {
          parsed = {};
        }
      }

      parsed.apiProvider = "openai";
      parsed.openAiBaseUrl = baseUrl;
      parsed.openAiModelId = model;
      parsed.enableReasoningEffort = true;
      parsed.reasoningEffort = reasoningEffort;
      parsed.openAiCustomModelInfo = {
        ...(parsed.openAiCustomModelInfo || {}),
        contextWindow: 1000000,
        maxTokens: -1,
        supportsImages: true,
        supportsPromptCache: false,
        inputPrice: 0,
        outputPrice: 0,
      };

      if (Array.isArray(parsed.listApiConfigMeta)) {
        if (!parsed.listApiConfigMeta.some((p: any) => p?.name === "QwenProxy")) {
          parsed.listApiConfigMeta.push({
            name: "QwenProxy",
            id: "qwenproxy-local",
            apiProvider: "openai",
            modelId: model,
          });
        }
        parsed.currentApiConfigName = "QwenProxy";
      }

      return JSON.stringify(parsed);
    };

    // Update keys
    for (const key of TARGET_KEYS) {
      const row = selectStmt.get(key) as { value: string } | undefined;
      // If row exists, update it. If it's saoudrizwan.claude-dev or ZooCode, ensure it is written.
      if (row || key === "saoudrizwan.claude-dev" || key === "ZooCodeOrganization.zoo-code") {
        const newVal = updateConfig(row?.value);
        insertStmt.run(key, newVal);
      }
    }

    db.close();

    return {
      client: "cline",
      filePath,
      backupPath,
      success: true,
      action: backupPath ? "updated" : "created",
      message: `Configured Cline in state.vscdb with model ${model} and reasoning effort ${reasoningEffort}`,
    };
  } catch (err: any) {
    return {
      client: "cline",
      filePath,
      success: false,
      action: "failed",
      error: err?.message || String(err),
    };
  }
}

export function restoreCline(filePath: string, backupPath?: string): ClientSyncResult {
  const restored = restoreFromBackup(filePath, backupPath);
  return {
    client: "cline",
    filePath,
    backupPath,
    success: restored,
    action: restored ? "restored" : "failed",
    message: restored ? "Restored Cline settings from backup" : "Backup file not found",
  };
}
