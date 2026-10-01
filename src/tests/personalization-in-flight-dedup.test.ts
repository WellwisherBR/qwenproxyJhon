import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";
process.env.TEST_PERSONALIZATION_DELAY_MS = "50";

import {
  syncQwenRequestPersonalization,
  getInFlightPersonalizationCount,
} from "../services/qwen.ts";

test("syncQwenRequestPersonalization coalesces concurrent calls with the same instruction", async () => {
  const accountId = "test-dedup-acc";
  const instruction = "Test Instructions for Dedup " + Date.now();

  assert.equal(getInFlightPersonalizationCount(), 0);

  // Fire 5 concurrent personalization requests
  const p1 = syncQwenRequestPersonalization(instruction, accountId, { forceSync: true });
  const p2 = syncQwenRequestPersonalization(instruction, accountId, { forceSync: true });
  const p3 = syncQwenRequestPersonalization(instruction, accountId, { forceSync: true });
  const p4 = syncQwenRequestPersonalization(instruction, accountId, { forceSync: true });
  const p5 = syncQwenRequestPersonalization(instruction, accountId, { forceSync: true });

  // While in flight, all 5 calls must share the EXACT same single in-flight Promise!
  assert.equal(
    getInFlightPersonalizationCount(),
    1,
    "Expected only 1 in-flight synchronization for all 5 concurrent calls",
  );

  const results = await Promise.all([p1, p2, p3, p4, p5]);
  assert.equal(results.length, 5);
  for (const r of results) {
    assert.equal(r, true);
  }

  // After settling, in-flight count returns to 0
  assert.equal(getInFlightPersonalizationCount(), 0);
});
