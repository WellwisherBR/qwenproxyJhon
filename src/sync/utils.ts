import fs from "node:fs";
import path from "node:path";

export function createTimestampBackup(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backupPath = path.join(dir, `${base}.qwenproxy.${timestamp}${ext}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function findLatestBackup(filePath: string): string | undefined {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  if (!fs.existsSync(dir)) return undefined;

  try {
    const files = fs.readdirSync(dir);
    const candidates = files
      .filter((f) => f.startsWith(base) && f.includes("qwenproxy") && f.endsWith(".bak"))
      .map((f) => path.join(dir, f))
      .sort((a, b) => {
        try {
          return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });

    return candidates[0];
  } catch {
    return undefined;
  }
}

export function restoreFromBackup(filePath: string, backupPath?: string): boolean {
  const targetBackup = (backupPath && fs.existsSync(backupPath))
    ? backupPath
    : findLatestBackup(filePath);

  if (!targetBackup || !fs.existsSync(targetBackup)) {
    return false;
  }
  fs.copyFileSync(targetBackup, filePath);
  try {
    fs.unlinkSync(targetBackup);
  } catch {
    // Ignore cleanup error
  }
  return true;
}
