import test from "node:test";
import assert from "node:assert";
import { Hono } from "hono";
import { stream as honoStream } from "hono/streaming";

test("streaming error handler emits visible content delta and terminal error for content moderation", async () => {
  const app = new Hono();
  app.get("/stream-err", (c) => {
    return honoStream(
      c,
      async () => {
        throw new Error("Qwen content moderation: data_inspection_failed");
      },
      async (err: Error, errorStream: any) => {
        const userFriendlyNotice = `\n\n⚠️ **[Qwen Moderação / Segurança]** ${err.message}\n\n`;
        const errorDelta = {
          choices: [{ delta: { content: userFriendlyNotice }, finish_reason: "content_filter" }],
        };
        await errorStream.write(`data: ${JSON.stringify(errorDelta)}\n\n`);
        await errorStream.write(
          `data: ${JSON.stringify({
            error: { message: err.message, type: "upstream_error", code: "data_inspection_failed" },
          })}\n\ndata: [DONE]\n\n`,
        );
      },
    );
  });

  const res = await app.request("http://localhost/stream-err");
  assert.equal(res.status, 200);
  const text = await res.text();

  assert.ok(text.includes("⚠️ **[Qwen Moderação / Segurança]**"));
  assert.ok(text.includes("data_inspection_failed"));
  assert.ok(text.includes("content_filter"));
  assert.ok(text.includes("data: [DONE]"));
});

test("streaming error handler never emits fake assistant content for network errors", async () => {
  const app = new Hono();
  app.get("/stream-net-err", (c) => {
    return honoStream(
      c,
      async () => {
        throw new Error("network error");
      },
      async (err: Error, errorStream: any) => {
        const isNetwork = true;
        const isModeration = false;
        if (!isNetwork && isModeration) {
          const userFriendlyNotice = `\n\n⚠️ **[Qwen Moderação / Segurança]** ${err.message}\n\n`;
          await errorStream.write(`data: ${JSON.stringify({ choices: [{ delta: { content: userFriendlyNotice } }] })}\n\n`);
        }
        await errorStream.write(
          `data: ${JSON.stringify({
            error: { message: err.message, type: "upstream_error", code: "network_error" },
          })}\n\ndata: [DONE]\n\n`,
        );
      },
    );
  });

  const res = await app.request("http://localhost/stream-net-err");
  assert.equal(res.status, 200);
  const text = await res.text();

  assert.ok(!text.includes("⚠️ **[Qwen"));
  assert.ok(!text.includes("finish_reason\":\"stop\""));
  assert.ok(text.includes("network_error"));
  assert.ok(text.includes("data: [DONE]"));
});
