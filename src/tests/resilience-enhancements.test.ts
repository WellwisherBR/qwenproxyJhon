import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";

import {
  isCaptchaRecoveryActive,
  recoverBaxiaCaptcha,
} from "../services/captcha-coordinator.ts";
import { keepAlivePlaywrightAccount } from "../services/playwright.ts";

test("isCaptchaRecoveryActive reflects active captcha solving status", async () => {
  const accountId = "test-captcha-status-" + Date.now();
  assert.equal(isCaptchaRecoveryActive(accountId), false);

  // In mock mode or when skipped, status stays false
  const result = await recoverBaxiaCaptcha(accountId, "unit-test");
  assert.equal(isCaptchaRecoveryActive(accountId), false);
  assert.equal(result, false);
});

test("keepAlivePlaywrightAccount safely handles accounts and respects idle/status constraints", async () => {
  const accountId = "test-keepalive-" + Date.now();
  // Safe execution: returns false when account page is not active without throwing
  const result = await keepAlivePlaywrightAccount(accountId);
  assert.equal(result, false);
});
