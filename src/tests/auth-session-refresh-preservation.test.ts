import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";

import {
  saveAuthSession,
  getValidAuthSession,
  getDatabase,
} from "../core/database.ts";

test("saveAuthSession preserves existing refreshToken when updated without one", () => {
  const accountId = "test-refresh-preserve-" + Date.now();
  const db = getDatabase();

  try {
    // 1. Initial save with 30-day refreshToken
    saveAuthSession(accountId, {
      cookie: "token=sample-jwt-token",
      userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
      bxV: "2.5.37",
      bxUa: "mock-ua",
      bxUmidtoken: "mock-umid",
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 900, // 15 mins
      refreshToken: "sample-30-day-refresh-token",
      capturedAt: Date.now(),
    });

    const initial = getValidAuthSession(accountId);
    assert.ok(initial, "Initial session should be valid");
    assert.equal(initial?.refreshToken, "sample-30-day-refresh-token");

    // 2. Secondary update (e.g. captureQwenHeaders or refreshHeadersInternal updating cookies and bx tokens)
    // where refreshToken is NOT passed or undefined
    saveAuthSession(accountId, {
      cookie: "token=sample-jwt-token-updated",
      userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
      bxV: "2.5.37",
      bxUa: "mock-ua-updated",
      bxUmidtoken: "mock-umid-updated",
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      capturedAt: Date.now(),
    });

    const updated = getValidAuthSession(accountId);
    assert.ok(updated, "Updated session should be valid");
    // Mechanical Proof: The 30-day refreshToken MUST NOT be wiped to NULL!
    assert.equal(
      updated?.refreshToken,
      "sample-30-day-refresh-token",
      "Existing refreshToken must be preserved when saveAuthSession is called without one",
    );
  } finally {
    // Cleanup
    db.prepare("DELETE FROM qwen_auth_sessions WHERE account_id = ?").run(
      accountId,
    );
  }
});
