import test from "node:test";
import assert from "node:assert/strict";
import {
  computePersonalizationDeadlineMs,
  PERSONALIZATION_SYNC_DEADLINE_MS,
  COLD_ACCOUNT_PERSONALIZATION_SYNC_DEADLINE_MS,
} from "../routes/chat/account.ts";
import {
  registerPlaywrightAccountForTests,
  unregisterPlaywrightAccountForTests,
} from "../services/playwright.ts";

test("Personalization Deadline: cold or undefined account gets at least 60s for Playwright initialization", () => {
  // For undefined or non-initialized account, it should give at least COLD_ACCOUNT_PERSONALIZATION_SYNC_DEADLINE_MS (60s)
  const deadlineCold = computePersonalizationDeadlineMs("non-existent-account-id", 60_000);
  assert.equal(deadlineCold, COLD_ACCOUNT_PERSONALIZATION_SYNC_DEADLINE_MS);
  assert.ok(deadlineCold >= 60_000);

  const deadlineUndefined = computePersonalizationDeadlineMs(undefined, 60_000);
  assert.equal(deadlineUndefined, COLD_ACCOUNT_PERSONALIZATION_SYNC_DEADLINE_MS);

  // If navigation timeout is larger (e.g. 90s), it honors the larger timeout
  const deadlineLargeNav = computePersonalizationDeadlineMs("cold-acc", 90_000);
  assert.equal(deadlineLargeNav, 90_000);
});

test("Personalization Deadline: returns standard 30s when account is warm / initialized in Playwright", () => {
  const warmAccountId = "test-warm-acc-" + Date.now();
  try {
    registerPlaywrightAccountForTests(warmAccountId, {} as any, Date.now());
    const deadlineWarm = computePersonalizationDeadlineMs(warmAccountId, 60_000);
    assert.equal(deadlineWarm, PERSONALIZATION_SYNC_DEADLINE_MS);
    assert.equal(deadlineWarm, 30_000);
  } finally {
    unregisterPlaywrightAccountForTests(warmAccountId);
  }
});
