import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import type { askAdvisor as AskAdvisor } from "../src/lib/ai/advisor";

function route(askAdvisor: typeof AskAdvisor) {
  return loadServerModule<typeof import("../src/app/api/ai-advisor/route")>("src/app/api/ai-advisor/route.ts", {
    "@/lib/ai/advisor": { askAdvisor },
    "@/lib/ai/page-context": { getPageContext: async () => null },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
  });
}
const ok = { ok: true as const, answer: "Ready.", references: [], toolsUsed: [], proposedAction: null };
function request(signal?: AbortSignal) {
  return new Request("http://localhost/api/ai-advisor", { method: "POST", body: JSON.stringify({ question: "Check my schedule" }), signal });
}

test("real tool activity is streamed before the answer", async () => {
  const api = route(async (_q, _p, _h, delta, options) => {
    options?.onToolStart?.("get_today_snapshot");
    delta?.("Ready.");
    return ok;
  });
  const result = await (await api.POST(request())).text();
  expect(result).toContain('event: progress\ndata: {"tool":"get_today_snapshot"}');
  expect(result.indexOf("event: progress")).toBeLessThan(result.indexOf("event: done"));
});

test("disconnecting the response propagates cancellation to the advisor", async () => {
  let signal: AbortSignal | undefined;
  let finish: () => void = () => {};
  const api = route(async (_q, _p, _h, _d, options) => {
    signal = options?.signal;
    await new Promise<void>(resolve => { finish = resolve; });
    return ok;
  });
  const response = await api.POST(request());
  await response.body!.cancel();
  expect(signal?.aborted).toBe(true);
  finish();
});

test("unexpected advisor failures do not reveal server details", async () => {
  const result = await (await route(async () => { throw new Error("private-db-password"); }).POST(request())).text();
  expect(result).toContain("event: error");
  expect(result).not.toContain("private-db-password");
});

test("an already cancelled request cannot start generation or tools", async () => {
  let started = false;
  const loaded = loadServerModule<typeof import("../src/lib/ai/advisor")>("src/lib/ai/advisor.ts", {
    "@/lib/ai/providers/anthropic": { AnthropicProvider: class { isConfigured() { return true; } async *stream() { started = true; yield { stopReason: "end_turn", text: "Ready", toolUses: [], rawContent: [] }; } } },
    "@/lib/ai/tools": { ALL_TOOLS: [], findTool: () => null, toolDefinitions: () => [] },
  });
  const abort = new AbortController(); abort.abort();
  const result = await loaded.askAdvisor("Hi", null, [], undefined, { signal: abort.signal }).catch(() => null);
  expect(started).toBe(false);
  expect(result?.ok).not.toBe(true);
});
