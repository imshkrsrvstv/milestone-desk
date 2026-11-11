import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelClient } from "../server/model-client.mjs";

const env = { AI_BASE_URL: "https://model.example/v1", AI_MODEL: "test-model", AI_API_KEY: "private-test-key" };
const input = { name: "test", schema: { type: "object" }, instructions: "Return only JSON.", input: { brief: "Untrusted supplied text" } };
const reply = (content, extra = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, ...extra } }] }));

test("provider configuration permits only clean HTTPS or explicit local HTTP endpoints", () => {
  for (const AI_BASE_URL of ["http://remote.example/v1", "https://u:p@model.example/v1", "https://model.example/v1?key=x", "file:///tmp/model", "bad"])
    assert.equal(createModelClient({ ...env, AI_BASE_URL }).configured, false);
  assert.equal(createModelClient({ ...env, AI_API_KEY: "" }).configured, false);
  assert.equal(createModelClient({ AI_BASE_URL: "http://127.0.0.1:11434/v1", AI_MODEL: "local-model" }).configured, true);
});

test("JSON transport sends only scoped data, keeps credentials in headers and forbids redirects", async () => {
  let call;
  const client = createModelClient({ ...env, PAYPAL_CLIENT_SECRET: "never-forward-this" }, async (url, init) => {
    call = { url, init }; return reply('{"accepted":true}');
  });
  assert.deepEqual(await client.complete(input), { accepted: true });
  assert.equal(String(call.url), "https://model.example/v1/chat/completions");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.headers.Authorization, "Bearer private-test-key");
  const body = JSON.parse(call.init.body);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.model, "test-model");
  assert.equal(body.tools, undefined);
  assert(!call.init.body.includes("never-forward-this"));
  assert(!call.init.body.includes("private-test-key"));
});

test("refusals, tool calls, truncated and malformed results cannot become a model result", async () => {
  for (const response of [reply("{}", { refusal: "no" }), reply("{}", { tool_calls: [{}] }), reply("not-json"),
    new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{}" } }] })),
    new Response("not-json"),
    new Response(JSON.stringify({ choices: [{ finish_reason: "content_filter", message: { content: "{}" } }] })),
    new Response(JSON.stringify({ choices: [{ finish_reason: null, message: { content: "{}" } }] }))]) {
    await assert.rejects(createModelClient(env, async () => response).complete(input));
  }
});

test("provider errors and oversized replies are bounded without leaking response bodies", { timeout: 1000 }, async () => {
  await assert.rejects(createModelClient(env, async () => new Response("private-provider-detail", { status: 401 })).complete(input),
    error => /credentials/.test(error.message) && !error.message.includes("private-provider-detail"));
  await assert.rejects(createModelClient(env, async () => new Response("x".repeat(131073))).complete(input), /size limit/);
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(131073)); },
    cancel() { return new Promise(() => {}); },
  }));
  await assert.rejects(createModelClient(env, async () => oversized).complete(input), /size limit/);
  await assert.rejects(createModelClient(env, async () => { throw Error("private-transport-detail"); }).complete(input),
    error => !error.message.includes("private-transport-detail"));
});

test("interrupted response bodies cannot disclose provider errors", async () => {
  const response = new Response(new ReadableStream({ pull(controller) { controller.error(Error("private-stream-detail")); } }));
  await assert.rejects(createModelClient(env, async () => response).complete(input),
    error => /interrupted/.test(error.message) && !error.message.includes("private-stream-detail"));
});

test("JSON-object compatibility and cancellation preserve explicit failure semantics", async () => {
  const client = createModelClient({ ...env, AI_FORMAT: "json_object" }, async (_, init) => {
    assert.deepEqual(JSON.parse(init.body).response_format, { type: "json_object" });
    return reply("{}");
  });
  await client.complete(input);
  const signal = AbortSignal.abort();
  await assert.rejects(createModelClient(env, async (_, init) => { init.signal.throwIfAborted(); }).complete({ ...input, signal }), /timed out/);
});


test("HTTP failures stay bounded and safe when body cancellation fails or stalls", { timeout: 1000 }, async () => {
  for (const [status, expected] of [[401, /credentials/], [429, /usage limit/], [503, /rejected the request/]]) {
    const response = new Response(new ReadableStream({ cancel() { throw Error("private-cancellation-detail"); } }), { status });
    await assert.rejects(createModelClient(env, async () => response).complete(input),
      error => expected.test(error.message) && !error.message.includes("private-cancellation-detail"));
  }
  const stalled = new Response(new ReadableStream({ cancel() { return new Promise(() => {}); } }), { status: 401 });
  await assert.rejects(createModelClient(env, async () => stalled).complete(input), /credentials/);
});
