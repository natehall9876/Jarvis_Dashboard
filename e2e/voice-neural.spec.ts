import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";

function speechRoute(fetchImpl: typeof fetch, authenticated = true, membership: { role: string; active: boolean } | null = { role: "owner", active: true }) {
  return loadServerModule<typeof import("../src/app/api/jarvis/speech/route")>("src/app/api/jarvis/speech/route.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: "owner" } : null }, error: null }) },
      from: (table: string) => {
        expect(table).toBe("app_members");
        return { select: () => ({ eq: (_key: string, userId: string) => {
          expect(userId).toBe("owner");
          return { maybeSingle: async () => ({ data: membership, error: null }) };
        } }) };
      },
    }) },
  }, fetchImpl);
}
function request(text: unknown = "Ready, Nate.", signal?: AbortSignal, origin?: string) {
  return new Request("http://localhost/api/jarvis/speech", { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify({ text }), signal });
}
async function withKey(run: () => Promise<void>) {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-credential";
  try { await run(); } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
}

test("speech auth rejects status and generation before any provider call", async () => {
  let calls = 0;
  const api = speechRoute(async () => { calls++; throw new Error("should not run"); }, false);
  expect((await api.GET()).status).toBe(401);
  expect((await api.POST(request())).status).toBe(401);
  expect(calls).toBe(0);
});

test("paid speech rejects nonowners, inactive owners and missing membership", async () => withKey(async () => {
  let calls = 0;
  for (const membership of [{ role: "employee", active: true }, { role: "owner", active: false }, null]) {
    const api = speechRoute(async () => { calls++; throw new Error("should not run"); }, true, membership);
    expect((await api.GET()).status).toBe(403);
    expect((await api.POST(request())).status).toBe(403);
  }
  expect(calls).toBe(0);
}));

test("speech refuses cross-site, empty and oversized input", async () => {
  let calls = 0;
  const api = speechRoute(async () => { calls++; throw new Error("should not run"); });
  expect((await api.POST(request("hello", undefined, "https://untrusted.invalid"))).status).toBe(403);
  for (const text of [null, "", " ", "x".repeat(4097)]) expect((await api.POST(request(text))).status).toBe(400);
  expect(calls).toBe(0);
});

test("missing credential announces browser fallback without a provider request", async () => {
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const api = speechRoute(async () => { throw new Error("should not run"); });
    const status = await api.GET(); expect(status.headers.get("cache-control")).toContain("no-store");
    expect(await status.json()).toMatchObject({ engine: "browser", reason: "not_configured" });
    const result = await api.POST(request()); expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ reason: "not_configured" });
  } finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

test("neural speech preserves a preset and British direction and streams before completion", async () => withKey(async () => {
  let payload: Record<string, unknown> = {};
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const api = speechRoute(async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; controller.enqueue(new Uint8Array([0, 0, 1, 0])); } }));
  });
  const result = await api.POST(request());
  expect(payload).toMatchObject({ model: "gpt-4o-mini-tts", voice: "cedar", response_format: "pcm", stream_format: "audio" });
  expect(payload.instructions).toContain("British English");
  expect(result.headers.get("content-type")).toBe("audio/pcm");
  const reader = result.body!.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([0, 0, 1, 0]));
  upstream.close(); expect((await reader.read()).done).toBe(true);
}));

test("speech cancellation aborts upstream and provider errors never leak secrets", async () => withKey(async () => {
  let signal: AbortSignal | undefined;
  const api = speechRoute(async (_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0, 0])); } }));
  });
  const response = await api.POST(request()); await response.body!.cancel(); expect(signal?.aborted).toBe(true);
  const failed = await speechRoute(async () => { throw new Error("private-provider-secret"); }).POST(request());
  expect(failed.status).toBe(502); expect(await failed.text()).not.toContain("private-provider-secret");
  const rejected = await speechRoute(async () => new Response("private-provider-secret", { status: 401 })).POST(request());
  expect(rejected.status).toBe(502); expect(await rejected.text()).not.toContain("private-provider-secret");
}));

test("odd PCM chunk boundaries retain samples without distortion", () => {
  const { decodePcm } = loadServerModule<typeof import("../src/lib/jarvis/speech-client")>("src/lib/jarvis/speech-client.ts");
  const first = decodePcm(new Uint8Array([0, 128, 255]), null);
  const second = decodePcm(new Uint8Array([127, 0, 0]), first.carry);
  expect([...first.samples]).toEqual([-1]); expect([...second.samples]).toEqual([32767 / 32768, 0]); expect(second.carry).toBeNull();
});

// Fake only the Web Audio boundary; exercise the real streaming player and abort handling.
test("player starts before stream end, measures real samples and stop cancels all nodes", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let upstream!: ReadableStreamDefaultController<Uint8Array>, cancelled = false;
  const nodes: Array<{ stopped: boolean; onended: (() => void) | null }> = [];
  class Context {
    state = "running"; currentTime = 0; destination = {};
    async resume() {} async close() {}
    createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, copyToChannel() {} }; }
    createBufferSource() { const node = { buffer: null, stopped: false, onended: null as (() => void) | null, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; this.onended?.(); } }; nodes.push(node); return node; }
    createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData(values: Float32Array) { values.fill(0.1); } }; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: Context, requestAnimationFrame: () => 1, cancelAnimationFrame() {} } });
  try {
    const { NeuralSpeechPlayer } = loadServerModule<typeof import("../src/lib/jarvis/speech-client")>("src/lib/jarvis/speech-client.ts", {}, async () => new Response(new ReadableStream({ start(controller) { upstream = controller; }, cancel() { cancelled = true; } })));
    const player = new NeuralSpeechPlayer(); player.unlock();
    const abort = new AbortController(); const levels: number[] = []; let firstAudio!: () => void;
    const started = new Promise<void>(resolve => { firstAudio = resolve; });
    const playback = player.play("Ready", abort.signal, firstAudio, level => levels.push(level));
    upstream.enqueue(new Uint8Array([0, 0, 1, 0])); await started;
    expect(levels.some(n => n > 0)).toBe(true); expect(cancelled).toBe(false);
    abort.abort(); await expect(playback).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true); expect(nodes.slice(1).every(node => node.stopped)).toBe(true); expect(levels.at(-1)).toBe(0);
    player.close();
  } finally { if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("player tells a locked browser to unlock before sending paid text", async () => {
  const { NeuralSpeechPlayer } = loadServerModule<typeof import("../src/lib/jarvis/speech-client")>("src/lib/jarvis/speech-client.ts", {}, async () => { throw new Error("must not send"); });
  await expect(new NeuralSpeechPlayer().play("Ready", new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({ reason: "audio_locked" });
});
