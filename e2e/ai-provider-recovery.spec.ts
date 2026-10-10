import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import type { AICompletionResult, AIStreamDelta } from "../src/lib/ai/provider";

function provider(fetcher: typeof fetch) {
  const loaded = loadServerModule<typeof import("../src/lib/ai/providers/anthropic")>(
    "src/lib/ai/providers/anthropic.ts",
    { "@/lib/env.server": { integrationEnv: { aiProvider: { apiKey: "dummy-key" } }, isIntegrationConfigured: () => true } },
    fetcher,
  );
  return new loaded.AnthropicProvider();
}
async function run(fetcher: typeof fetch) {
  const events: (AICompletionResult | AIStreamDelta)[] = [];
  for await (const event of provider(fetcher).stream({ system: "Test", messages: [{ role: "user", content: "Test" }], tools: [] })) events.push(event);
  return events[events.length - 1] as AICompletionResult;
}
function response(events: unknown[], crlf = false) {
  return new Response(events.map(event => "data: " + JSON.stringify(event) + "\n\n").join("").replaceAll("\n", crlf ? "\r\n" : "\n"),
    { headers: { "content-type": "text/event-stream" } });
}
const textEvents = [
  { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Your schedule is ready." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: "message_stop" },
];
const toolEvents = (json: string) => [
  textEvents[0],
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool_test", name: "get_open_tasks", input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: json } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: "message_stop" },
];

test("an expired AI key gives an actionable error without leaking provider content", async () => {
  const result = await run(async () => new Response("private-upstream-detail", { status: 401 }));
  expect(result.stopReason).toBe("error");
  expect(result.errorMessage).toMatch(/key.*(expired|invalid|rejected)/i);
  expect(result.errorMessage).not.toContain("private-upstream-detail");
});
test("provider outages never expose the raw response body", async () => {
  const result = await run(async () => new Response("private-upstream-detail", { status: 529 }));
  expect(result.stopReason).toBe("error");
  expect(result.errorMessage).not.toContain("private-upstream-detail");
});
test("transport failures never expose raw exception details", async () => {
  const result = await run(async () => { throw new Error("private-transport-detail"); });
  expect(result.stopReason).toBe("error");
  expect(result.errorMessage).not.toContain("private-transport-detail");
});
test("AI requests have a cancellation deadline and bypass caches", async () => {
  let request: RequestInit | undefined;
  await run(async (_url, init) => { request = init; return new Response(null, { status: 503 }); });
  expect(request?.signal).toBeInstanceOf(AbortSignal);
  expect(request?.cache).toBe("no-store");
});
test("an interrupted answer is never returned as successful", async () => {
  const result = await run(async () => response(textEvents.slice(0, -1)));
  expect(result).toMatchObject({ stopReason: "error", toolUses: [], rawContent: [] });
});
test("an interrupted tool response cannot execute even with a complete JSON argument", async () => {
  const result = await run(async () => response(toolEvents("{}").slice(0, -1)));
  expect(result).toMatchObject({ stopReason: "error", toolUses: [], rawContent: [] });
});
for (const json of ['{"task_id":', "null", "[]"]) {
  test("invalid tool input is rejected instead of replaced with defaults: " + json, async () => {
    const result = await run(async () => response(toolEvents(json)));
    expect(result).toMatchObject({ stopReason: "error", toolUses: [], rawContent: [] });
  });
}
test("stream errors are redacted and cannot dispatch tools", async () => {
  const result = await run(async () => response([...toolEvents("{}").slice(0, -1), { type: "error", error: { type: "authentication_error", message: "private-stream-detail" } }]));
  expect(result).toMatchObject({ stopReason: "error", toolUses: [] });
  expect(result.errorMessage).not.toContain("private-stream-detail");
});
test("a completed tool response preserves its exact object arguments", async () => {
  const result = await run(async () => response(toolEvents('{"status":"open"}')));
  expect(result).toMatchObject({ stopReason: "tool_use", toolUses: [{ id: "tool_test", name: "get_open_tasks", input: { status: "open" } }] });
});
for (const crlf of [false, true]) {
  test("a complete text stream remains usable with " + (crlf ? "CRLF" : "LF") + " frames", async () => {
    expect(await run(async () => response(textEvents, crlf))).toMatchObject({ stopReason: "end_turn", text: "Your schedule is ready.", toolUses: [] });
  });
}

function extract(fetcher: typeof fetch) {
  return loadServerModule<typeof import("../src/lib/ai/work-sheet-extraction")>(
    "src/lib/ai/work-sheet-extraction.ts",
    { "@/lib/env.server": { integrationEnv: { aiProvider: { apiKey: "dummy-key" } }, isIntegrationConfigured: () => true } },
    fetcher,
  ).extractWorkSheetInfo("dummy-image", "image/jpeg");
}
test("photo extraction rejects an expired AI key without exposing the response", async () => {
  const result = await extract(async () => new Response("private-photo-detail", { status: 401 }));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message).toMatch(/key.*(expired|invalid|rejected)/i);
    expect(result.message).not.toContain("private-photo-detail");
  }
});
for (const body of ["<html>private-photo-detail</html>", "null", '{"content":{}}']) {
  test("photo extraction reports malformed provider data safely: " + body, async () => {
    await expect(extract(async () => new Response(body))).resolves.toMatchObject({ ok: false });
  });
}
test("photo extraction rejects a truncated model response even when its JSON parses", async () => {
  await expect(extract(async () => Response.json({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"legible":true}' }] }))).resolves.toMatchObject({ ok: false });
});
test("photo extraction preserves a valid result for owner review", async () => {
  await expect(extract(async () => Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: '{"legible":true,"service_description":"Bush trimming","price_guess":180}' }] }))).resolves.toMatchObject({ ok: true, data: { legible: true, service_description: "Bush trimming", price_guess: 180 } });
});
test("photo extraction has a cancellation deadline and bypasses caches", async () => {
  let request: RequestInit | undefined;
  await extract(async (_url, init) => { request = init; return new Response(null, { status: 503 }); });
  expect(request?.signal).toBeInstanceOf(AbortSignal);
  expect(request?.cache).toBe("no-store");
});

test("cancelling the owner request cancels the upstream AI fetch", async () => {
  const owner = new AbortController();
  let upstream: AbortSignal | null | undefined;
  const ai = provider(async (_url, init) => { upstream = init?.signal; return new Response(null, { status: 503 }); });
  for await (const event of ai.stream({ system: "Test", messages: [], tools: [], signal: owner.signal })) void event;
  owner.abort();
  expect(upstream?.aborted).toBe(true);
});
