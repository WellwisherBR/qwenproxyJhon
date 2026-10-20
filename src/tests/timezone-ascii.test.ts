import test from "node:test";
import assert from "node:assert";

import { formatAsciiTimezone, sanitizeHeaderForFetch } from "../utils/timezone.ts";
import { getBrowserFetchHeaders } from "../services/qwen.ts";

test("formatAsciiTimezone produces pure ASCII matching browser date format regardless of system locale", () => {
  const d = new Date(1760540000000);
  const tz = formatAsciiTimezone(d);

  // Must match standard Chrome browser format: "Wed Oct 15 2025 14:33:20 GMT..."
  assert.ok(/^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}$/.test(tz), `unexpected format: ${tz}`);

  // Guarantee every single character is pure ASCII (code point <= 127)
  for (let i = 0; i < tz.length; i++) {
    assert.ok(tz.charCodeAt(i) <= 127, `character at index ${i} has code point > 127: ${tz.charCodeAt(i)}`);
  }
});

test("sanitizeHeaderForFetch strips characters with code point > 255 to prevent window.fetch TypeError", () => {
  // Russian text (Cyrillic > 255)
  const cyrillic = "Вс окт 11 2026";
  const sanitized = sanitizeHeaderForFetch(cyrillic);
  for (let i = 0; i < sanitized.length; i++) {
    assert.ok(sanitized.charCodeAt(i) <= 255);
  }

  // Pure ASCII strings pass through untouched
  const pureAscii = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
  assert.strictEqual(sanitizeHeaderForFetch(pureAscii), pureAscii);
});

test("getBrowserFetchHeaders sanitizes non-ISO-8859-1 characters from header values", () => {
  const inputHeaders: Record<string, string> = {
    accept: "application/json",
    timezone: "Вс окт 11 2026 21:22:51 GMT+0300",
    "x-request-id": "req-12345-🎉",
  };

  const headers = getBrowserFetchHeaders(inputHeaders);
  assert.ok(headers.timezone !== undefined);
  assert.ok(headers["x-request-id"] !== undefined);

  // Verify none of the header values have code points > 255
  for (const [key, value] of Object.entries(headers)) {
    for (let i = 0; i < value.length; i++) {
      assert.ok(value.charCodeAt(i) <= 255, `header ${key} contains non-ISO-8859-1 code point: ${value.charCodeAt(i)}`);
    }
  }
});
