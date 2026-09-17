import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

import { config } from "../core/config.ts";
import { getSyncStatePath } from "../core/paths.ts";
import type {
  ClientSyncResult,
  SyncAllOptions,
  SyncClientName,
  SyncStateFile,
} from "./types.ts";
import { syncClaudeCode, restoreClaudeCode } from "./claude-code.ts";
import { syncCodex, restoreCodex } from "./codex.ts";
import { syncOpenCode, restoreOpenCode } from "./opencode.ts";
import { syncOmp, restoreOmp } from "./omp.ts";
import { syncHermes, restoreHermes } from "./hermes.ts";
import { syncOpenClaw, restoreOpenClaw } from "./openclaw.ts";
import { syncKilo, restoreKilo } from "./kilo.ts";
import { syncCline, restoreCline } from "./cline.ts";
import { syncZed, restoreZed } from "./zed.ts";
import { syncAider, restoreAider } from "./aider.ts";

export function resolveApiKey(overrideKey?: string, configKey?: string): string {
  if (overrideKey && overrideKey.trim().length > 0) {
    return overrideKey.trim();
  }
  const envKey = process.env.API_KEY || process.env.ADMIN_PASSWORD || configKey;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return "sk-qwenproxy-local";
}

export function normalizeClientName(name: string): SyncClientName | null {
  const clean = name.trim().toLowerCase().replace(/[-_ ]/g, "");
  if (clean === "claude" || clean === "claudecode" || clean === "anthropic") return "claude-code";
  if (clean === "codex" || clean === "codexcli" || clean === "openai") return "codex";
  if (clean === "opencode") return "opencode";
  if (clean === "omp" || clean === "ohmypi" || clean === "pi") return "omp";
  if (clean === "hermes" || clean === "hermesagent" || clean === "nous" || clean === "nousresearch") return "hermes";
  if (clean === "openclaw" || clean === "claw" || clean === "clawdbot" || clean === "moltbot") return "openclaw";
  if (clean === "kilo" || clean === "kilocode") return "kilo";
  if (
    clean === "cline" ||
    clean === "claudedev" ||
    clean === "zoo" ||
    clean === "zoocode" ||
    clean === "roo" ||
    clean === "roocode" ||
    clean === "roocline"
  ) {
    return "cline";
  }
  if (clean === "zed" || clean === "zededitor") return "zed";
  if (clean === "aider" || clean === "aiderchat") return "aider";
  return null;
}

export function resolveBaseUrls(port = 7936, host = "127.0.0.1"): {
  anthropicBaseUrl: string;
  openaiBaseUrl: string;
} {
  const cleanHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    anthropicBaseUrl: `http://${cleanHost}:${port}`,
    openaiBaseUrl: `http://${cleanHost}:${port}/v1`,
  };
}

export function getDefaultPaths(): {
  claudeCode: string;
  codex: string;
  openCode: string;
  omp: string;
  hermes: string;
  openClaw: string;
  kilo: string;
  cline: string;
  zed: string;
  aider: string;
} {
  const home = os.homedir();
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const appData = process.env.APPDATA || (isWindows ? path.join(home, "AppData", "Roaming") : "");

  // OpenCode candidates
  const openCodeCandidates = [
    path.join(home, ".config", "opencode", "opencode.jsonc"),
    path.join(home, ".config", "opencode", "opencode.json"),
    path.join(home, ".opencode", "opencode.jsonc"),
    path.join(home, ".opencode", "opencode.json"),
  ];
  const existingOpenCode = openCodeCandidates.find((p) => fs.existsSync(p));

  // Kilo candidates
  const kiloCandidates = [
    path.join(home, ".config", "kilo", "kilo.json"),
    path.join(home, ".kilo", "kilo.json"),
    path.join(home, ".config", "kilo", "config.json"),
    path.join(home, ".kilo", "config.json"),
  ];
  const existingKilo = kiloCandidates.find((p) => fs.existsSync(p));

  // Cline state.vscdb
  let clinePath: string;
  if (isWindows) {
    clinePath = path.join(appData, "Code", "User", "globalStorage", "state.vscdb");
  } else if (isMac) {
    clinePath = path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "state.vscdb");
  } else {
    clinePath = path.join(home, ".config", "Code", "User", "globalStorage", "state.vscdb");
  }

  // Zed settings.json
  let zedPath: string;
  if (isWindows) {
    zedPath = path.join(appData, "Zed", "settings.json");
  } else {
    zedPath = path.join(home, ".config", "zed", "settings.json");
  }

  return {
    claudeCode: path.join(home, ".claude", "settings.json"),
    codex: process.env.CODEX_HOME
      ? path.join(process.env.CODEX_HOME, "config.toml")
      : path.join(home, ".codex", "config.toml"),
    openCode: existingOpenCode || openCodeCandidates[0],
    omp: path.join(home, ".omp", "agent", "models.yml"),
    hermes: path.join(home, ".hermes", "config.yaml"),
    openClaw: path.join(home, ".openclaw", "openclaw.json"),
    kilo: existingKilo || kiloCandidates[0],
    cline: clinePath,
    zed: zedPath,
    aider: path.join(home, ".aider.conf.yml"),
  };
}

export function getDefaultStateFilePath(): string {
  return getSyncStatePath();
}

export interface ClientDetectionStatus {
  id: SyncClientName;
  installed: boolean;
  synced: boolean;
  model?: string;
  url?: string;
}

/**
 * Inspects a client configuration file to determine whether the client is installed
 * and whether it is actively configured to route to QwenProxy.
 */
export function inspectClientSyncStatus(
  id: SyncClientName,
  filePath?: string,
  port = 7936,
): ClientDetectionStatus {
  const defaultPaths = getDefaultPaths();
  const targetPath =
    filePath ||
    (id === "claude-code"
      ? defaultPaths.claudeCode
      : id === "codex"
        ? defaultPaths.codex
        : id === "opencode"
          ? defaultPaths.openCode
          : id === "omp"
            ? defaultPaths.omp
            : id === "hermes"
              ? defaultPaths.hermes
              : id === "openclaw"
                ? defaultPaths.openClaw
                : id === "kilo"
                  ? defaultPaths.kilo
                  : id === "cline"
                    ? defaultPaths.cline
                    : id === "zed"
                      ? defaultPaths.zed
                      : defaultPaths.aider);

  if (!fs.existsSync(targetPath)) {
    return { id, installed: false, synced: false };
  }

  try {
    if (id === "cline") {
      // Inspect SQLite DB
      let isSynced = false;
      let model: string | undefined;
      try {
        const db = new Database(targetPath, { readonly: true });
        const row = db
          .prepare(
            `SELECT value FROM ItemTable WHERE key = 'saoudrizwan.claude-dev' OR key = 'ZooCodeOrganization.zoo-code' LIMIT 1`,
          )
          .get() as { value: string } | undefined;
        db.close();
        if (row && row.value) {
          const parsed = JSON.parse(row.value);
          const url = parsed.openAiBaseUrl || "";
          model = parsed.openAiModelId;
          isSynced = Boolean(
            url &&
              (url.includes(String(port)) ||
                url.includes(`127.0.0.1:${port}`) ||
                url.includes(`localhost:${port}`)),
          );
        }
      } catch {}
      return { id, installed: true, synced: isSynced, model };
    }

    const raw = fs.readFileSync(targetPath, "utf-8");

    if (id === "claude-code") {
      const data = JSON.parse(raw);
      const url = data?.env?.ANTHROPIC_BASE_URL || "";
      const model = data?.env?.ANTHROPIC_MODEL || data?.model || "";
      const isLocalHost =
        url.includes(String(port)) ||
        url.includes(`127.0.0.1:${port}`) ||
        url.includes(`localhost:${port}`);
      const isSynced =
        isLocalHost &&
        (model.toLowerCase().includes("qwen") || Boolean(data?.env?.ANTHROPIC_AUTH_TOKEN));
      return {
        id,
        installed: true,
        synced: isSynced,
        model: model || undefined,
        url: url || undefined,
      };
    }

    if (id === "codex") {
      const hasProvider = raw.includes("[model_providers.qwenproxy]");
      const isProviderActive = /^model_provider\s*=\s*["']qwenproxy["']/m.test(raw);
      const modelMatch = raw.match(/^model\s*=\s*["']([^"']+)["']/m);
      const model = modelMatch ? modelMatch[1] : undefined;
      const urlMatch = raw.match(/\[model_providers\.qwenproxy\][\s\S]*?base_url\s*=\s*["']([^"']+)["']/);
      const url = urlMatch ? urlMatch[1] : "";
      const isLocalHost = Boolean(
        url && (url.includes(String(port)) || url.includes(`127.0.0.1:${port}`) || url.includes(`localhost:${port}`)),
      );
      return {
        id,
        installed: true,
        synced: hasProvider && isProviderActive && isLocalHost,
        model,
      };
    }

    if (id === "opencode") {
      let isSynced = false;
      try {
        const data = JSON.parse(raw);
        const provider = data?.provider?.qwenproxy;
        const url = provider?.options?.baseURL || "";
        const isLocalHost =
          url.includes(String(port)) ||
          url.includes(`127.0.0.1:${port}`) ||
          url.includes(`localhost:${port}`);
        isSynced = Boolean(provider && isLocalHost);
      } catch {
        const qwenBlockMatch = raw.match(/"qwenproxy"\s*:\s*\{[\s\S]*?"baseURL"\s*:\s*"([^"]+)"/);
        const url = qwenBlockMatch ? qwenBlockMatch[1] : "";
        isSynced = Boolean(
          url &&
            (url.includes(String(port)) ||
              url.includes(`127.0.0.1:${port}`) ||
              url.includes(`localhost:${port}`)),
        );
      }
      return {
        id,
        installed: true,
        synced: isSynced,
      };
    }

    if (id === "omp") {
      const ompMatch = raw.match(/^[ \t]*qwenproxy:\s*\r?\n((?:[ \t]{4,}.*\r?\n?)*)/m);
      let isSynced = false;
      let url: string | undefined;
      if (ompMatch) {
        const urlMatch = ompMatch[1].match(/baseUrl:\s*(\S+)/);
        url = urlMatch ? urlMatch[1].replace(/['"]/g, "") : undefined;
        isSynced = Boolean(
          url &&
            (url.includes(String(port)) ||
              url.includes(`127.0.0.1:${port}`) ||
              url.includes(`localhost:${port}`)),
        );
      }
      return {
        id,
        installed: true,
        synced: isSynced,
        url,
      };
    }

    if (id === "hermes") {
      const isLocalHost =
        raw.includes(String(port)) ||
        raw.includes(`127.0.0.1:${port}`) ||
        raw.includes(`localhost:${port}`);
      const isSynced = isLocalHost && (raw.includes("qwenproxy") || raw.includes("qwen"));
      return { id, installed: true, synced: isSynced };
    }

    if (id === "openclaw") {
      const isLocalHost =
        raw.includes(String(port)) ||
        raw.includes(`127.0.0.1:${port}`) ||
        raw.includes(`localhost:${port}`);
      const isSynced = isLocalHost && raw.includes("qwenproxy");
      return { id, installed: true, synced: isSynced };
    }

    if (id === "kilo") {
      const isLocalHost =
        raw.includes(String(port)) ||
        raw.includes(`127.0.0.1:${port}`) ||
        raw.includes(`localhost:${port}`);
      const isSynced = isLocalHost && raw.includes("qwenproxy");
      return { id, installed: true, synced: isSynced };
    }

    if (id === "zed") {
      const isLocalHost =
        raw.includes(String(port)) ||
        raw.includes(`127.0.0.1:${port}`) ||
        raw.includes(`localhost:${port}`);
      const isSynced = isLocalHost && raw.includes("QwenProxy");
      return { id, installed: true, synced: isSynced };
    }

    if (id === "aider") {
      const isLocalHost =
        raw.includes(String(port)) ||
        raw.includes(`127.0.0.1:${port}`) ||
        raw.includes(`localhost:${port}`);
      const isSynced = isLocalHost && raw.includes("qwen");
      return { id, installed: true, synced: isSynced };
    }
  } catch {
    return { id, installed: true, synced: false };
  }

  return { id, installed: true, synced: false };
}

export interface SyncAllResult {
  apiKey: string;
  port: number;
  host: string;
  clients: {
    claudeCode?: ClientSyncResult;
    codex?: ClientSyncResult;
    openCode?: ClientSyncResult;
    omp?: ClientSyncResult;
    hermes?: ClientSyncResult;
    openClaw?: ClientSyncResult;
    kilo?: ClientSyncResult;
    cline?: ClientSyncResult;
    zed?: ClientSyncResult;
    aider?: ClientSyncResult;
  };
}

export function syncAllClients(options: SyncAllOptions = {}): SyncAllResult {
  const defaultPaths = getDefaultPaths();
  const paths = {
    claudeCode: options.customPaths?.claudeCode || defaultPaths.claudeCode,
    codex: options.customPaths?.codex || defaultPaths.codex,
    openCode: options.customPaths?.openCode || defaultPaths.openCode,
    omp: options.customPaths?.omp || defaultPaths.omp,
    hermes: options.customPaths?.hermes || defaultPaths.hermes,
    openClaw: options.customPaths?.openClaw || defaultPaths.openClaw,
    kilo: options.customPaths?.kilo || defaultPaths.kilo,
    cline: options.customPaths?.cline || defaultPaths.cline,
    zed: options.customPaths?.zed || defaultPaths.zed,
    aider: options.customPaths?.aider || defaultPaths.aider,
  };

  const port = options.port ?? (config.server?.port || 7936);
  const configuredHost = config.server?.host;
  const host = options.host ?? (configuredHost && configuredHost !== "0.0.0.0" ? configuredHost : "127.0.0.1");
  const apiKey = resolveApiKey(options.apiKey, config.apiKey);
  const { anthropicBaseUrl, openaiBaseUrl } = resolveBaseUrls(port, host);
  const stateFilePath = options.stateFilePath || getDefaultStateFilePath();

  const results: SyncAllResult = {
    apiKey,
    port,
    host,
    clients: {},
  };

  const stateRecords: SyncStateFile["clients"] = {};
  const shouldSync = (client: SyncClientName) => {
    if (!options.targets || options.targets.length === 0) return true;
    return options.targets.includes(client);
  };

  // 1. Claude Code
  if (shouldSync("claude-code")) {
    const claudeExisted = fs.existsSync(paths.claudeCode);
    const claudeRes = syncClaudeCode({
      filePath: paths.claudeCode,
      apiKey,
      baseUrl: anthropicBaseUrl,
    });
    results.clients.claudeCode = claudeRes;
    if (claudeRes.success && claudeRes.backupPath) {
      stateRecords.claudeCode = {
        filePath: paths.claudeCode,
        backupPath: claudeRes.backupPath,
        existedBefore: claudeExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 2. Codex
  if (shouldSync("codex")) {
    const codexExisted = fs.existsSync(paths.codex);
    const codexRes = syncCodex({
      filePath: paths.codex,
      apiKey,
      baseUrl: openaiBaseUrl,
      setActive: options.setActive ?? true,
    });
    results.clients.codex = codexRes;
    if (codexRes.success && codexRes.backupPath) {
      stateRecords.codex = {
        filePath: paths.codex,
        backupPath: codexRes.backupPath,
        existedBefore: codexExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 3. OpenCode
  if (shouldSync("opencode")) {
    const openCodeExisted = fs.existsSync(paths.openCode);
    const openCodeRes = syncOpenCode({
      filePath: paths.openCode,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.openCode = openCodeRes;
    if (openCodeRes.success && openCodeRes.backupPath) {
      stateRecords.openCode = {
        filePath: paths.openCode,
        backupPath: openCodeRes.backupPath,
        existedBefore: openCodeExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 4. OMP
  if (shouldSync("omp")) {
    const ompExisted = fs.existsSync(paths.omp);
    const ompRes = syncOmp({
      filePath: paths.omp,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.omp = ompRes;
    if (ompRes.success && ompRes.backupPath) {
      stateRecords.omp = {
        filePath: paths.omp,
        backupPath: ompRes.backupPath,
        existedBefore: ompExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 5. Hermes Agent
  if (shouldSync("hermes")) {
    const hermesExisted = fs.existsSync(paths.hermes);
    const hermesRes = syncHermes({
      filePath: paths.hermes,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.hermes = hermesRes;
    if (hermesRes.success && hermesRes.backupPath) {
      stateRecords.hermes = {
        filePath: paths.hermes,
        backupPath: hermesRes.backupPath,
        existedBefore: hermesExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 6. OpenClaw
  if (shouldSync("openclaw")) {
    const openClawExisted = fs.existsSync(paths.openClaw);
    const openClawRes = syncOpenClaw({
      filePath: paths.openClaw,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.openClaw = openClawRes;
    if (openClawRes.success && openClawRes.backupPath) {
      stateRecords.openClaw = {
        filePath: paths.openClaw,
        backupPath: openClawRes.backupPath,
        existedBefore: openClawExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 7. Kilo Code
  if (shouldSync("kilo")) {
    const kiloExisted = fs.existsSync(paths.kilo);
    const kiloRes = syncKilo({
      filePath: paths.kilo,
      apiKey,
      baseUrl: openaiBaseUrl,
      setActive: options.setActive ?? true,
    });
    results.clients.kilo = kiloRes;
    if (kiloRes.success && kiloRes.backupPath) {
      stateRecords.kilo = {
        filePath: paths.kilo,
        backupPath: kiloRes.backupPath,
        existedBefore: kiloExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 8. Cline
  if (shouldSync("cline")) {
    const clineExisted = fs.existsSync(paths.cline);
    const clineRes = syncCline({
      filePath: paths.cline,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.cline = clineRes;
    if (clineRes.success && clineRes.backupPath) {
      stateRecords.cline = {
        filePath: paths.cline,
        backupPath: clineRes.backupPath,
        existedBefore: clineExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 9. Zed Editor
  if (shouldSync("zed")) {
    const zedExisted = fs.existsSync(paths.zed);
    const zedRes = syncZed({
      filePath: paths.zed,
      apiKey,
      baseUrl: openaiBaseUrl,
      setActive: options.setActive ?? true,
    });
    results.clients.zed = zedRes;
    if (zedRes.success && zedRes.backupPath) {
      stateRecords.zed = {
        filePath: paths.zed,
        backupPath: zedRes.backupPath,
        existedBefore: zedExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // 10. Aider
  if (shouldSync("aider")) {
    const aiderExisted = fs.existsSync(paths.aider);
    const aiderRes = syncAider({
      filePath: paths.aider,
      apiKey,
      baseUrl: openaiBaseUrl,
    });
    results.clients.aider = aiderRes;
    if (aiderRes.success && aiderRes.backupPath) {
      stateRecords.aider = {
        filePath: paths.aider,
        backupPath: aiderRes.backupPath,
        existedBefore: aiderExisted,
        syncedAt: Date.now(),
      };
    }
  }

  // Persist sync state
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    const stateContent: SyncStateFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      apiKey,
      port,
      host,
      clients: stateRecords,
    };
    fs.writeFileSync(stateFilePath, JSON.stringify(stateContent, null, 2) + "\n", "utf-8");
  } catch (err) {
    console.error("Warning: could not write sync state file:", err);
  }

  return results;
}

export interface RestoreAllResult {
  restoredCount: number;
  details: ClientSyncResult[];
}

export function restoreAllClients(options: { stateFilePath?: string } = {}): RestoreAllResult {
  const stateFilePath = options.stateFilePath || getDefaultStateFilePath();
  const details: ClientSyncResult[] = [];
  let restoredCount = 0;

  if (!fs.existsSync(stateFilePath)) {
    return { restoredCount: 0, details };
  }

  try {
    const raw = fs.readFileSync(stateFilePath, "utf-8");
    const state: SyncStateFile = JSON.parse(raw);

    if (state.clients.claudeCode?.backupPath) {
      const res = restoreClaudeCode(state.clients.claudeCode.filePath, state.clients.claudeCode.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.codex?.backupPath) {
      const res = restoreCodex(state.clients.codex.filePath, state.clients.codex.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.openCode?.backupPath) {
      const res = restoreOpenCode(state.clients.openCode.filePath, state.clients.openCode.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.omp?.backupPath) {
      const res = restoreOmp(state.clients.omp.filePath, state.clients.omp.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.hermes?.backupPath) {
      const res = restoreHermes(state.clients.hermes.filePath, state.clients.hermes.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.openClaw?.backupPath) {
      const res = restoreOpenClaw(state.clients.openClaw.filePath, state.clients.openClaw.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.kilo?.backupPath) {
      const res = restoreKilo(state.clients.kilo.filePath, state.clients.kilo.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.cline?.backupPath) {
      const res = restoreCline(state.clients.cline.filePath, state.clients.cline.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.zed?.backupPath) {
      const res = restoreZed(state.clients.zed.filePath, state.clients.zed.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    if (state.clients.aider?.backupPath) {
      const res = restoreAider(state.clients.aider.filePath, state.clients.aider.backupPath);
      details.push(res);
      if (res.success) restoredCount++;
    }

    // Remove state file after successful restoration
    try {
      fs.unlinkSync(stateFilePath);
    } catch {
      // Ignore
    }
  } catch (err) {
    console.error("Error reading sync state file:", err);
  }

  return { restoredCount, details };
}
