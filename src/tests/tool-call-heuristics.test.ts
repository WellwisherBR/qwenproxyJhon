import test from "node:test";
import assert from "node:assert";

import {
  isToolHesitationText,
  decideMissingToolCallRetry,
} from "../tools/tool-call-heuristics.ts";

test("isToolHesitationText detects model hesitation about missing tools", () => {
  assert.equal(isToolHesitationText("Tool bash does not exists."), true);
  assert.equal(isToolHesitationText("Tool read does not exist."), true);
  assert.equal(isToolHesitationText("The tool write doesn't exist in my environment."), true);
  assert.equal(isToolHesitationText("tools do not exist"), true);

  // Normal prose does not match
  assert.equal(isToolHesitationText("I will now read the file."), false);
  assert.equal(isToolHesitationText("The bash script ran successfully."), false);
  assert.equal(isToolHesitationText(""), false);
});

test("decideMissingToolCallRetry only retries when tools were declared and model hesitated", () => {
  // 1. Tools declared, 0 calls emitted, model hesitated -> RETRY
  const d1 = decideMissingToolCallRetry({
    declaredToolCount: 3,
    successfulToolCallCount: 0,
    malformedToolCallCount: 0,
    emittedToolCallCount: 0,
    text: "Tool bash does not exists.",
  });
  assert.deepEqual(d1, { retry: true, reason: "no_call" });

  // 2. Normal prose when tools are declared -> NO RETRY (user asked a question)
  const d2 = decideMissingToolCallRetry({
    declaredToolCount: 3,
    successfulToolCallCount: 0,
    malformedToolCallCount: 0,
    emittedToolCallCount: 0,
    text: "Paris is the capital of France.",
  });
  assert.deepEqual(d2, { retry: false, reason: null });

  // 3. No tools declared -> NO RETRY
  const d3 = decideMissingToolCallRetry({
    declaredToolCount: 0,
    successfulToolCallCount: 0,
    malformedToolCallCount: 0,
    emittedToolCallCount: 0,
    text: "Tool bash does not exists.",
  });
  assert.deepEqual(d3, { retry: false, reason: null });

  // 4. Successful tool call produced -> NO RETRY
  const d4 = decideMissingToolCallRetry({
    declaredToolCount: 3,
    successfulToolCallCount: 1,
    malformedToolCallCount: 0,
    emittedToolCallCount: 1,
    text: "",
  });
  assert.deepEqual(d4, { retry: false, reason: null });
});
