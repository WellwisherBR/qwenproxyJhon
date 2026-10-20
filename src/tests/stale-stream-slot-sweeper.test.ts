import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";

import { config } from "../core/config.ts";
import {
  acquireAccountStreamLock,
  sweepStaleAccountStreamSlots,
  stopStaleSlotSweeperForTests,
  STREAM_SLOT_MAX_HOLD_MS,
} from "../services/qwen.ts";

test("sweepStaleAccountStreamSlots force-releases abandoned slots and unblocks waiting queue", async () => {
  const accountId = "test-sweeper-" + Date.now();
  const prevCapacity = config.concurrency.maxStreamsPerAccount;
  config.concurrency.maxStreamsPerAccount = 1;

  try {
    // 1. Acquire slot 1
    const release1 = await acquireAccountStreamLock(accountId);
    assert.ok(typeof release1 === "function");

    // 2. Queue up a second acquire (should not resolve immediately because capacity=1)
    let secondAcquired = false;
    let release2Fn: (() => void) | null = null;
    const secondPromise = acquireAccountStreamLock(accountId).then((rel) => {
      secondAcquired = true;
      release2Fn = rel;
    });

    // Verify second request is indeed waiting in queue
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(secondAcquired, false, "second acquire must be waiting in queue");

    // 3. Stale sweeper run with 0ms hold should not sweep unaged slots if threshold is high
    const nonSwept = sweepStaleAccountStreamSlots(60_000);
    assert.strictEqual(nonSwept, 0, "should not sweep slots held for less than maxHoldMs");
    assert.strictEqual(secondAcquired, false, "second acquire should still be waiting");

    // 4. Stale sweeper run with 10ms threshold after 15ms sleep sweeps the abandoned slot
    await new Promise((r) => setTimeout(r, 25));
    const swept = sweepStaleAccountStreamSlots(10);
    assert.strictEqual(swept, 1, "sweeper must force-release the stale slot");

    // 5. The queued second request should now be unblocked and acquired!
    await secondPromise;
    assert.strictEqual(secondAcquired, true, "queued waiter must be unblocked after sweeper force-release");

    // Clean up second release
    if (release2Fn) (release2Fn as () => void)();
  } finally {
    config.concurrency.maxStreamsPerAccount = prevCapacity;
    stopStaleSlotSweeperForTests();
  }
});

test("STREAM_SLOT_MAX_HOLD_MS is configured to 30 minutes", () => {
  assert.strictEqual(STREAM_SLOT_MAX_HOLD_MS, 30 * 60 * 1000);
});
