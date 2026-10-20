import test from "node:test";
import assert from "node:assert";

import { applyUpstreamUsage, type UsageAccumulator } from "../routes/chat/helpers.ts";

test("applyUpstreamUsage accepts both Qwen and OpenAI usage shapes", () => {
  // 1. Qwen shape: input_tokens / output_tokens
  const accQwen: UsageAccumulator = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedPromptTokens: 0,
    hasRealPromptTokens: false,
    hasRealCompletionTokens: false,
    hasRealTotalTokens: false,
  };
  applyUpstreamUsage(accQwen, { input_tokens: 150, output_tokens: 40, total_tokens: 190 });
  assert.equal(accQwen.promptTokens, 150);
  assert.equal(accQwen.completionTokens, 40);
  assert.equal(accQwen.totalTokens, 190);
  assert.equal(accQwen.hasRealPromptTokens, true);

  // 2. OpenAI shape: prompt_tokens / completion_tokens
  const accOpenAI: UsageAccumulator = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedPromptTokens: 0,
    hasRealPromptTokens: false,
    hasRealCompletionTokens: false,
    hasRealTotalTokens: false,
  };
  applyUpstreamUsage(accOpenAI, { prompt_tokens: 220, completion_tokens: 65, total_tokens: 285 });
  assert.equal(accOpenAI.promptTokens, 220, "must accept prompt_tokens as fallback");
  assert.equal(accOpenAI.completionTokens, 65, "must accept completion_tokens as fallback");
  assert.equal(accOpenAI.totalTokens, 285);
  assert.equal(accOpenAI.hasRealPromptTokens, true);
});
