import test from "node:test";
import assert from "node:assert";

import { Mutex } from "../core/mutex.ts";

test("Mutex: late release from force-released holder is inert and does not double-grant", async () => {
  const mutex = new Mutex("test-epoch", 20); // 20ms hold limit

  // 1. Holder A acquires
  const releaseA = await mutex.acquire(1000, "holder-A");

  // 2. Wait out the hold limit so A becomes stale
  await new Promise((r) => setTimeout(r, 30));

  // 3. Holder B acquires via stale force-release
  const releaseB = await mutex.acquire(1000, "holder-B");
  assert.equal(mutex.state().heldBy, "holder-B");

  // 4. Waiter C queues up
  let cAcquired = false;
  let releaseC: (() => void) | null = null;
  const cPromise = mutex.acquire(1000, "holder-C").then((rel) => {
    cAcquired = true;
    releaseC = rel;
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cAcquired, false, "C must be waiting in queue behind B");

  // 5. Stale holder A calls release late: must be inert and NOT grant to C while B holds
  releaseA();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cAcquired, false, "C must still be waiting; late release from A must not double-grant");
  assert.equal(mutex.state().heldBy, "holder-B");

  // 6. Current holder B releases: now C acquires cleanly
  releaseB();
  await cPromise;
  assert.equal(cAcquired, true, "C must acquire only after legitimate holder B releases");
  assert.equal(mutex.state().heldBy, "holder-C");

  if (releaseC) (releaseC as () => void)();
});
