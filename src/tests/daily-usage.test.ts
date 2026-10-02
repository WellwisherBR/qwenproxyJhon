import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";

import {
  getUtcDateString,
  recordTurnUsage,
  getAccountDailyUsage,
  getPoolDailyUsageSummary,
  DAILY_ACCOUNT_TOKEN_BASELINE,
} from "../core/daily-usage.ts";
import { getDatabase } from "../core/database.ts";

test("getUtcDateString formats UTC date correctly", () => {
  // 2026-10-01 23:59:00 UTC -> 2026-10-01
  const t1 = new Date("2026-10-01T23:59:00.000Z").getTime();
  assert.equal(getUtcDateString(t1), "2026-10-01");

  // 2026-10-02 00:01:00 UTC (which is 21:01 BRT) -> 2026-10-02
  const t2 = new Date("2026-10-02T00:01:00.000Z").getTime();
  assert.equal(getUtcDateString(t2), "2026-10-02");
});

test("recordTurnUsage accumulates tokens and turn count for an account", () => {
  const accountId = "test-usage-acc-" + Date.now();
  const db = getDatabase();

  try {
    // Turn 1
    recordTurnUsage(accountId, {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
    });

    let usage = getAccountDailyUsage(accountId);
    assert.equal(usage.turnsCount, 1);
    assert.equal(usage.promptTokens, 1000);
    assert.equal(usage.completionTokens, 500);
    assert.equal(usage.totalTokens, 1500);
    assert.equal(
      usage.usagePercent,
      Math.min(100, Math.round((500 / DAILY_ACCOUNT_TOKEN_BASELINE) * 100)),
    );

    // Turn 2
    recordTurnUsage(accountId, {
      prompt_tokens: 2000,
      completion_tokens: 1500,
      total_tokens: 3500,
    });

    usage = getAccountDailyUsage(accountId);
    assert.equal(usage.turnsCount, 2);
    assert.equal(usage.promptTokens, 3000);
    assert.equal(usage.completionTokens, 2000);
    assert.equal(usage.totalTokens, 5000);
    assert.equal(
      usage.usagePercent,
      Math.min(100, Math.round((2000 / DAILY_ACCOUNT_TOKEN_BASELINE) * 100)),
    );
  } finally {
    db.prepare("DELETE FROM account_daily_usage WHERE account_id = ?").run(
      accountId,
    );
  }
});

test("getPoolDailyUsageSummary aggregates active accounts correctly", () => {
  const acc1 = "test-pool-acc1-" + Date.now();
  const acc2 = "test-pool-acc2-" + Date.now();
  const db = getDatabase();

  try {
    recordTurnUsage(acc1, { prompt_tokens: 5000, completion_tokens: 20000 });
    recordTurnUsage(acc2, { prompt_tokens: 10000, completion_tokens: 30000 });

    const summary = getPoolDailyUsageSummary([acc1, acc2]);
    assert.equal(summary.totalPromptTokens, 15000);
    assert.equal(summary.totalCompletionTokens, 50000);
    assert.equal(summary.totalTokens, 65000);
    assert.equal(summary.totalTurns, 2);
    assert.equal(summary.poolCapacityTokens, 2 * DAILY_ACCOUNT_TOKEN_BASELINE);
    // 50,000 / (2 * 400,000) = 50,000 / 800,000 = 6.25% -> 6%
    assert.equal(
      summary.poolUsagePercent,
      Math.round((50000 / (2 * DAILY_ACCOUNT_TOKEN_BASELINE)) * 100),
    );
  } finally {
    db.prepare("DELETE FROM account_daily_usage WHERE account_id IN (?, ?)").run(
      acc1,
      acc2,
    );
  }
});
