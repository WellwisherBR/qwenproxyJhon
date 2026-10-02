import test from "node:test";
import assert from "node:assert";

process.env.TEST_MOCK_QWEN_AUTH = "true";
process.env.API_KEY = "";

import { app } from "../api/server.js";
import { getDatabase } from "../core/database.ts";
import { invalidateAccountsCache } from "../core/accounts.ts";
import { clearAllAccountCooldowns } from "../core/account-manager.ts";

test("pool failover: skips multiple quota-exhausted accounts and succeeds on available account in pool (non-stream)", async () => {
  const db = getDatabase();
  const acc1 = "pool-quota-acc1";
  const acc2 = "pool-quota-acc2";
  const acc3 = "pool-quota-acc3";

  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc1, "pool-q1@test.com", "pass1"
  );
  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc2, "pool-q2@test.com", "pass2"
  );
  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc3, "pool-q3@test.com", "pass3"
  );
  invalidateAccountsCache();
  clearAllAccountCooldowns();

  const originalFetch = globalThis.fetch;
  const attempts: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);

    if (url.includes("/api/v2/chats/new")) {
      return new Response(JSON.stringify({ chat_id: "test-chat-session" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/v2/chat/completions")) {
      attempts.push("attempt-" + attempts.length);

      // First 2 accounts fail with Alibaba membership_limit quota error
      if (attempts.length <= 2) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "membership_limit",
            data: {
              code: "membership_limit",
              details: "Qwen upstream membership limit reached (update_member)",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // 3rd account succeeds with valid SSE stream
      return new Response(
        "data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"SUCCESS_AFTER_QUOTA_ROTATION\"}}]}\n\ndata: [DONE]\n\n",
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    return originalFetch(input, init);
  };

  try {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3.7-plus",
        messages: [{ role: "user", content: "Test quota rotation across pool" }],
        stream: false,
      }),
    });

    const json: any = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(json.choices?.[0]?.message?.content.includes("SUCCESS_AFTER_QUOTA_ROTATION"));
    assert.ok(attempts.length >= 3, `Expected at least 3 attempts, got ${attempts.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    db.prepare("DELETE FROM accounts WHERE id IN (?, ?, ?)").run(acc1, acc2, acc3);
    invalidateAccountsCache();
    clearAllAccountCooldowns();
  }
});

test("stream recovery: skips multiple mid-stream quota-exhausted accounts and recovers on available account in pool", async () => {
  const db = getDatabase();
  const acc1 = "pool-stream-acc1";
  const acc2 = "pool-stream-acc2";
  const acc3 = "pool-stream-acc3";
  const acc4 = "pool-stream-acc4";

  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc1, "stream-q1@test.com", "pass1"
  );
  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc2, "stream-q2@test.com", "pass2"
  );
  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc3, "stream-q3@test.com", "pass3"
  );
  db.prepare("INSERT OR REPLACE INTO accounts (id, email, password) VALUES (?, ?, ?)").run(
    acc4, "stream-q4@test.com", "pass4"
  );
  invalidateAccountsCache();
  clearAllAccountCooldowns();

  const originalFetch = globalThis.fetch;
  const attempts: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);

    if (url.includes("/api/v2/chats/new")) {
      return new Response(JSON.stringify({ chat_id: "test-stream-session" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/v2/chat/completions")) {
      attempts.push("stream-attempt-" + attempts.length);

      // First 3 accounts fail with SSE error chunk: membership_limit
      if (attempts.length <= 3) {
        return new Response(
          "data: {\"error\":{\"code\":\"membership_limit\",\"message\":\"Qwen upstream membership limit reached (update_member)\"}}\n\n",
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }

      // 3rd account succeeds
      return new Response(
        "data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"STREAM_SUCCESS_AFTER_QUOTA\"}}]}\n\ndata: [DONE]\n\n",
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    return originalFetch(input, init);
  };

  try {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3.7-plus",
        messages: [{ role: "user", content: "Test stream quota failover across pool" }],
        stream: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("STREAM_SUCCESS_AFTER_QUOTA"), `Expected STREAM_SUCCESS_AFTER_QUOTA in body, got: ${body}`);
    assert.ok(attempts.length >= 4, `Expected at least 4 attempts, got ${attempts.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    db.prepare("DELETE FROM accounts WHERE id IN (?, ?, ?, ?)").run(acc1, acc2, acc3, acc4);
    invalidateAccountsCache();
    clearAllAccountCooldowns();
  }
});
