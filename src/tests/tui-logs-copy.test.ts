import test from "node:test";
import assert from "node:assert";
import { LogsView } from "../tui/views/logs-view.ts";
import { ServerManager } from "../tui/server-manager.ts";
import { getServerLogFilePath } from "../core/paths.ts";
import { getClipboardText } from "../tui/theme.ts";

test("TUI LogsView: copyLogs(false) copies all logs even when a line is selected", async () => {
  const sm = ServerManager.getInstance();
  sm.clearLogs();

  (sm as any).logEntries.push({ time: "10:00:00", level: "INFO", message: "First message" });
  (sm as any).logEntries.push({ time: "10:00:01", level: "WARN", message: "Second warning" });
  (sm as any).logEntries.push({ time: "10:00:02", level: "ERROR", message: "Third error" });

  const view = new LogsView();
  // Simulate user having selected line 1
  (view as any).selectedLogIndex = 1;

  // Clicking "Copiar" (c.id === "copy") or pressing 'y' calls copyLogs(false)
  (view as any).copyLogs(false);

  const copied = getClipboardText();
  assert.ok(copied.includes("First message"), "Must include first message");
  assert.ok(copied.includes("Second warning"), "Must include second warning");
  assert.ok(copied.includes("Third error"), "Must include third error");
});

test("TUI LogsView: copyLogs(true) copies only the single selected line", async () => {
  const sm = ServerManager.getInstance();
  sm.clearLogs();

  (sm as any).logEntries.push({ time: "10:00:00", level: "INFO", message: "First message" });
  (sm as any).logEntries.push({ time: "10:00:01", level: "WARN", message: "Second warning" });

  const view = new LogsView();
  (view as any).selectedLogIndex = 1;

  // Pressing Enter calls copyLogs(true)
  (view as any).copyLogs(true);

  const copied = getClipboardText();
  assert.ok(!copied.includes("First message"), "Must NOT include first message");
  assert.ok(copied.includes("Second warning"), "Must include selected message only");
});

test("Paths: getServerLogFilePath returns path in data/logs directory", () => {
  const logPath = getServerLogFilePath();
  assert.ok(logPath.endsWith("server.log"));
  assert.ok(logPath.includes("logs"));
});
