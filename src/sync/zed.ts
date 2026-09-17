import fs from "node:fs";
import path from "node:path";
import type { ClientSyncResult, SyncOptions } from "./types.ts";
import { createTimestampBackup, restoreFromBackup } from "./utils.ts";

function parseJsonWithComments(raw: string): Record<string, any> {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const nextCh = raw[i + 1] || "";

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && nextCh === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === "/" && nextCh === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && nextCh === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    result += ch;
  }

  const cleaned = result.replace(/,\s*([\}\]])/g, "$1");
  return JSON.parse(cleaned);
}

function buildZedAvailableModels(primaryModel: string = "qwen3.8-max"): any[] {
  const models = [
    {
      name: primaryModel,
      max_tokens: 1000000,
      max_output_tokens: 131072,
      max_completion_tokens: 131072,
      capabilities: {
        tools: true,
        images: true,
        parallel_tool_calls: true,
        prompt_cache_key: true,
        chat_completions: true,
        interleaved_reasoning: true,
      },
    },
    {
      name: `${primaryModel}-thinking`,
      max_tokens: 1000000,
      max_output_tokens: 131072,
      max_completion_tokens: 131072,
      capabilities: {
        tools: true,
        images: true,
        parallel_tool_calls: true,
        prompt_cache_key: true,
        chat_completions: true,
        interleaved_reasoning: true,
      },
    },
    {
      name: `${primaryModel}-fast`,
      max_tokens: 1000000,
      max_output_tokens: 131072,
      max_completion_tokens: 131072,
      capabilities: {
        tools: true,
        images: true,
        parallel_tool_calls: true,
        prompt_cache_key: true,
        chat_completions: true,
        interleaved_reasoning: true,
      },
    },
  ];

  if (primaryModel !== "qwen3.7-plus") {
    models.push({
      name: "qwen3.7-plus",
      max_tokens: 1000000,
      max_output_tokens: 65536,
      max_completion_tokens: 65536,
      capabilities: {
        tools: true,
        images: true,
        parallel_tool_calls: true,
        prompt_cache_key: true,
        chat_completions: true,
        interleaved_reasoning: true,
      },
    });
  }

  return models;
}

export function syncZed(options: SyncOptions): ClientSyncResult {
  const { filePath, baseUrl, model = "qwen3.8-max", setActive = true } = options;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    let backupPath: string | undefined;
    let existingSettings: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      backupPath = createTimestampBackup(filePath);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        existingSettings = parseJsonWithComments(content);
      } catch {
        existingSettings = {};
      }
    }

    const languageModels = existingSettings.language_models || {};
    const openaiCompatible = languageModels.openai_compatible || {};

    openaiCompatible.QwenProxy = {
      api_url: baseUrl,
      available_models: buildZedAvailableModels(model),
    };

    const updatedSettings: Record<string, any> = {
      ...existingSettings,
      language_models: {
        ...languageModels,
        openai_compatible: openaiCompatible,
      },
    };

    if (setActive) {
      const existingAgent = existingSettings.agent || {};
      updatedSettings.agent = {
        ...existingAgent,
        default_model: {
          provider: "QwenProxy",
          model,
          enable_thinking: true,
        },
      };
    }

    fs.writeFileSync(filePath, JSON.stringify(updatedSettings, null, 2) + "\n", "utf-8");

    return {
      client: "zed",
      filePath,
      backupPath,
      success: true,
      action: backupPath ? "updated" : "created",
      message: `Configured Zed Editor with QwenProxy (${baseUrl}) and model ${model}`,
    };
  } catch (err: any) {
    return {
      client: "zed",
      filePath,
      success: false,
      action: "failed",
      error: err?.message || String(err),
    };
  }
}

export function restoreZed(filePath: string, backupPath?: string): ClientSyncResult {
  const restored = restoreFromBackup(filePath, backupPath);
  return {
    client: "zed",
    filePath,
    backupPath,
    success: restored,
    action: restored ? "restored" : "failed",
    message: restored ? "Restored Zed settings from backup" : "Backup file not found",
  };
}
