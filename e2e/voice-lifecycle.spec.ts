import { test, expect } from "@playwright/test";
import * as React from "react";
import { loadServerModule } from "./load-server-module";

// Runs the actual provider callbacks with controlled browser event boundaries.
// No real microphone, browser automation, provider request, or customer records.
function harness(options: { startThrows?: boolean; fetchImpl?: typeof fetch; speechMock?: Record<string, unknown> } = {}) {
  let cursor = 0, now = 0, serial = 0;
  const slots: unknown[] = [], pending: Array<() => void> = [];
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sessions: SR[] = [], spoken: Utterance[] = [];
  const routes: string[] = [];
  const listeners = new Map<string, () => void>();
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const same = (a?: unknown[], b?: unknown[]) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  function memo<T>(fn: () => T, deps?: unknown[]): T {
    const i = cursor++;
    const old = slots[i] as { deps?: unknown[]; value: T } | undefined;
    if (old && same(old.deps, deps)) return old.value;
    const value = fn(); slots[i] = { deps, value }; return value;
  }
  class SR {
    lang = ""; interimResults = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = false; stopped = false;
    constructor() { sessions.push(this); }
    start() { if (options.startThrows) throw new Error("device-private-details"); this.started = true; }
    stop() { this.stopped = true; this.onend?.(); }
    abort() { this.stopped = true; this.onend?.(); }
    say(text: string) { this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } } }); }
  }
  class Utterance {
    text: string; lang = ""; rate = 1; voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(text: string) { this.text = text; }
  }
  const voices = [
    { name: "Microsoft David", lang: "en-US", voiceURI: "david", default: true, localService: true },
    { name: "Daniel (Enhanced)", lang: "en-GB", voiceURI: "daniel", default: false, localService: true },
  ];
  const synth = {
    speaking: false,
    getVoices: () => voices,
    speak(u: Utterance) { if (!u.text) { u.onend?.(); return; } this.speaking = true; spoken.push(u); },
    cancel() { this.speaking = false; },
  };
  const windowFake = {
    SpeechRecognition: SR, speechSynthesis: synth, sessionStorage: storage, localStorage: storage,
    setTimeout(fn: () => void, ms = 0) { timers.set(++serial, { at: now + ms, fn }); return serial; },
    clearTimeout(id: number) { timers.delete(id); },
    addEventListener(name: string, cb: () => void) { listeners.set(name, cb); },
    removeEventListener(name: string) { listeners.delete(name); },
  };
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const priorUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
  Object.defineProperty(globalThis, "window", { value: windowFake, configurable: true });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  const router = { push: (url: string) => routes.push(url), refresh() {} };
  const provider = loadServerModule<typeof import("../src/components/jarvis/jarvis-provider")>("src/components/jarvis/jarvis-provider.tsx", {
    react: {
      ...React,
      useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useMemo: memo,
      useCallback<T>(fn: T, deps: unknown[]) { return memo(() => fn, deps); },
      useEffect(fn: () => void, deps?: unknown[]) { const i = cursor++; const old = slots[i] as unknown[] | undefined; if (!same(old, deps)) { slots[i] = deps; pending.push(fn); } },
    },
    "next/navigation": { useRouter: () => router, usePathname: () => "/" },
    ...(options.speechMock ? { "@/lib/jarvis/speech-client": options.speechMock } : {}),
    "@/lib/actions/jobs": { getFirstJobToday: async () => ({ ok: true, job: null }) },
  }, options.fetchImpl);
  function render() {
    cursor = 0;
    const tree = provider.JarvisProvider({ children: null });
    while (pending.length) pending.shift()!();
    return tree.props.value as ReturnType<typeof provider.useJarvis>;
  }
  function advance(ms: number) {
    const end = now + ms;
    for (let n = 0; n < 50; n++) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); render();
    }
    now = end; return render();
  }
  render(); advance(0);
  return {
    render, advance, sessions, spoken, routes, synth,
    finish() { synth.speaking = false; spoken.at(-1)?.onend?.(); render(); },
    dispose() {
      render().stopResponse();
      if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow); else Reflect.deleteProperty(globalThis, "window");
      if (priorUtterance) Object.defineProperty(globalThis, "SpeechSynthesisUtterance", priorUtterance); else Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
    },
  };
}

test("hands-free begins capture on its first tap", () => {
  const h = harness(); try { h.render().toggleConversationMode(); expect(h.render().listening).toBe(true); expect(h.sessions[0]?.started).toBe(true); } finally { h.dispose(); }
});
test("hang-up stops capture and ignores a late transcript", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening();
    const old = h.sessions[0]; h.render().toggleConversationMode(); old.say("Open my schedule"); h.advance(2000);
    expect(h.render().conversationMode).toBe(false); expect(h.render().listening).toBe(false); expect(old.stopped).toBe(true); expect(h.routes).toEqual([]);
  } finally { h.dispose(); }
});
test("a silent end restarts capture but bounded silence ends the call", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening();
    h.sessions.at(-1)!.onend?.(); h.advance(800);
    expect(h.sessions).toHaveLength(2); expect(h.render().listening).toBe(true);
    for (let n = 0; n < 4; n++) { h.sessions.at(-1)!.onend?.(); h.advance(1000); }
    expect(h.render().conversationMode).toBe(false); expect(h.render().voiceError).toContain("hear");
  } finally { h.dispose(); }
});
test("blocked microphone ends hands-free and a failed start explains recovery", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening(); h.sessions.at(-1)!.onerror?.({ error: "not-allowed" }); h.advance(2000);
    expect(h.render().conversationMode).toBe(false); expect(h.render().voiceError).toContain("blocked");
  } finally { h.dispose(); }
  const fail = harness({ startThrows: true }); try {
    fail.render().startListening(); expect(fail.render().voiceError).toBeTruthy(); expect(fail.render().voiceError).not.toContain("private");
  } finally { fail.dispose(); }
});
test("final transcript releases capture before speech and selects the installed British voice", () => {
  const h = harness(); try {
    h.render().startListening(); const old = h.sessions[0]; old.say("Open my schedule");
    expect(h.render().listening).toBe(false); expect(old.stopped).toBe(true);
    expect(h.spoken[0]?.voice).toMatchObject({ name: "Daniel (Enhanced)" });
    expect(h.spoken[0]?.rate).toBe(1.15);
    old.say("Open my schedule"); expect(h.routes).toEqual(["/schedule"]);
  } finally { h.dispose(); }
});
test("muted hands-free continues after a command without waiting for speech", () => {
  const h = harness(); try {
    h.render().toggleMute(); h.render().toggleConversationMode(); h.render().startListening();
    h.sessions[0].say("Open my schedule"); h.sessions[0].onend?.(); h.advance(1000);
    expect(h.spoken).toHaveLength(0); expect(h.sessions).toHaveLength(2); expect(h.render().listening).toBe(true);
  } finally { h.dispose(); }
});
test("stop listening prevents a scheduled restart", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening(); h.sessions[0].onend?.(); h.render().stopListening(); h.advance(2000);
    expect(h.render().conversationMode).toBe(false); expect(h.render().listening).toBe(false); expect(h.sessions).toHaveLength(1);
  } finally { h.dispose(); }
});

test("stop listening discards a final transcript delivered during stop", () => {
  const h = harness(); try {
    h.render().toggleConversationMode();
    const old = h.sessions[0];
    old.stop = () => { old.say("Open my schedule"); old.onend?.(); };
    old.abort = () => { old.stopped = true; old.say("Open my schedule"); old.onend?.(); };
    h.render().stopListening();
    old.say("Open my schedule"); h.advance(2000);
    expect(h.routes).toEqual([]);
    expect(h.render().exchanges).toEqual([]);
    expect(h.render().listening).toBe(false);
    expect(h.render().conversationMode).toBe(false);
    expect(old.stopped).toBe(true);
  } finally { h.dispose(); }
});

test("stop listening releases a silent engine immediately so the next tap works", () => {
  const h = harness(); try {
    h.render().startListening();
    const old = h.sessions[0];
    old.stop = () => { old.stopped = true; };
    old.abort = () => { old.stopped = true; };
    h.render().stopListening();
    expect(h.render().listening).toBe(false);
    h.render().startListening();
    expect(h.sessions).toHaveLength(2);
    old.onend?.(); old.say("Open my schedule");
    expect(h.render().listening).toBe(true);
    expect(h.routes).toEqual([]);
  } finally { h.dispose(); }
});

test("a typed request releases capture before fetching and ignores the old transcript", async () => {
  let capturedDuringFetch = true;
  const h = harness({ fetchImpl: async () => {
    capturedDuringFetch = h.render().listening;
    return new Response('event: done\ndata: {"answer":"Ready.","references":[],"toolsUsed":[]}\n\n');
  } });
  try {
    h.render().toggleConversationMode();
    const old = h.sessions[0];
    await h.render().submit("What needs my attention?");
    old.say("Open my schedule");
    expect(capturedDuringFetch).toBe(false);
    expect(old.stopped).toBe(true);
    expect(h.routes).toEqual([]);
    expect(h.render().exchanges).toHaveLength(1);
    expect(h.render().exchanges[0].answer).toBe("Ready.");
    h.advance(1000);
    expect(h.render().conversationMode).toBe(true);
    expect(h.sessions).toHaveLength(2);
    expect(h.render().listening).toBe(true);
  } finally { h.dispose(); }
});

test("typed navigation releases capture and resumes an active hands-free session once", async () => {
  const h = harness(); try {
    h.render().toggleConversationMode();
    const old = h.sessions[0];
    await h.render().submit("Open my schedule");
    expect(old.stopped).toBe(true);
    expect(h.render().listening).toBe(false);
    h.advance(1000);
    expect(h.sessions).toHaveLength(2);
    expect(h.render().listening).toBe(true);
    expect(h.routes).toEqual(["/schedule"]);
    expect(h.spoken).toEqual([]);
  } finally { h.dispose(); }
});

for (const mode of ["missing", "throws"] as const) {
  test(`hang-up falls back to stop when recognition abort ${mode}`, () => {
    const h = harness(); try {
      h.render().toggleConversationMode();
      const old = h.sessions[0];
      Object.defineProperty(old, "abort", { value: mode === "missing" ? undefined : () => { throw new Error("already stopping"); } });
      old.stop = () => { old.stopped = true; old.say("Open my schedule"); old.onend?.(); };
      h.render().stopResponse(); h.advance(1000);
      expect(old.stopped).toBe(true);
      expect(h.render().listening).toBe(false);
      expect(h.render().conversationMode).toBe(false);
      expect(h.routes).toEqual([]);
      expect(h.sessions).toHaveLength(1);
    } finally { h.dispose(); }
  });
}
test("speech failure ends the call and exposes a recovery message", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening(); h.sessions[0].say("Open my schedule");
    h.spoken[0].onerror?.({ error: "audio-busy" }); h.advance(2000);
    expect(h.render().speaking).toBe(false); expect(h.render().conversationMode).toBe(false); expect(h.render().voiceError).toBeTruthy();
  } finally { h.dispose(); }
});
test("a completed spoken command resumes listening once and hang-up cancels it", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.render().startListening(); h.sessions[0].say("Open my schedule"); h.finish(); h.advance(1000);
    expect(h.sessions).toHaveLength(2);
    h.render().toggleConversationMode(); h.advance(2000); expect(h.render().listening).toBe(false); expect(h.sessions).toHaveLength(2);
  } finally { h.dispose(); }
});

test("voice speaks the complete final answer, never a tool preamble or chopped sentence offsets", async () => {
  const body = 'event: delta\ndata: {"text":"Checking the records. "}\n\nevent: delta\ndata: {"text":"The lookup is complete. "}\n\nevent: done\ndata: {"answer":"Ready, Nate. Your next job is at ten.","references":[],"toolsUsed":[]}\n\n';
  const h = harness({ fetchImpl: async () => new Response(body) });
  try {
    await h.render().submit("What is next?", { viaVoice: true });
    expect(h.spoken.map(u => u.text)).toEqual(["Ready, Nate. Your next job is at ten."]);
  } finally { h.dispose(); }
});

test("interrupting spoken output resumes hands-free instead of stranding the call", () => {
  const h = harness(); try {
    h.render().toggleConversationMode(); h.sessions[0].say("Open my schedule");
    expect(h.render().speaking).toBe(true);
    h.render().stopSpeaking(); h.advance(1000);
    expect(h.render().speaking).toBe(false); expect(h.render().listening).toBe(true); expect(h.sessions).toHaveLength(2);
  } finally { h.dispose(); }
});

test("foreground announcements speak without advisor turns and finish or cancel cleanly", async () => {
  let calls = 0;
  const h = harness({ fetchImpl: async () => { calls++; throw new Error("must not call advisor"); } });
  try {
    let finished = false;
    const notice = h.render().announce("Your estimate is in forty minutes.").then(() => { finished = true; });
    expect(h.spoken.map(u => u.text)).toEqual(["Your estimate is in forty minutes."]);
    expect(finished).toBe(false); h.finish(); await notice;
    expect(finished).toBe(true); expect(calls).toBe(0); expect(h.render().exchanges).toEqual([]);
    const cancelled = h.render().announce("Your work is saved."); h.render().stopSpeaking(); await cancelled;
    expect(h.render().speaking).toBe(false);
  } finally { h.dispose(); }
});

test("foreground announcements honor mute, listening and active output", async () => {
  const h = harness();
  try {
    h.render().toggleMute(); await h.render().announce("Muted notice."); expect(h.spoken).toHaveLength(0);
    h.render().toggleMute(); h.render().startListening(); await h.render().announce("Busy notice."); expect(h.spoken).toHaveLength(0);
    h.render().stopListening(); const notice = h.render().announce("First notice."); await h.render().announce("Duplicate notice.");
    expect(h.spoken.map(u => u.text)).toEqual(["First notice."]); h.finish(); await notice;
  } finally { h.dispose(); }
});


test("neural cancellation ignores late completion and resumes capture once", async () => {
  const playback: Array<{ signal: AbortSignal; finish: () => void }> = [];
  const h = harness({
    fetchImpl: async () => Response.json({ engine: "neural", voice: "cedar" }),
    speechMock: {
      neuralPlaybackSupported: () => true,
      SpeechPlaybackError: class extends Error {},
      NeuralSpeechPlayer: class {
        unlock() {} close() {}
        play(_text: string, signal: AbortSignal) { return new Promise<void>(finish => playback.push({ signal, finish })); }
      },
    },
  });
  try {
    for (let i = 0; i < 5; i++) { await Promise.resolve(); h.render(); }
    expect(h.render().speechEngine).toBe("neural");
    h.render().toggleConversationMode(); h.sessions[0].say("Open my schedule");
    expect(h.render().speaking).toBe(true); h.advance(1000); expect(h.sessions).toHaveLength(1);
    h.render().stopSpeaking(); expect(playback[0].signal.aborted).toBe(true);
    playback[0].finish(); await Promise.resolve(); h.advance(1000);
    expect(h.sessions).toHaveLength(2); expect(h.render().listening).toBe(true); expect(h.render().speaking).toBe(false);
  } finally { h.dispose(); }
});


test("long final answers play every bounded segment in order without speaking deltas", async () => {
  const answer = "Your recorded scope remains unchanged. Check access before scheduling. ".repeat(85).trim();
  const body = `event: delta\ndata: ${JSON.stringify({ text: "Checking records." })}\n\nevent: done\ndata: ${JSON.stringify({ answer, references: [], toolsUsed: [] })}\n\n`;
  const h = harness({ fetchImpl: async () => new Response(body) });
  try {
    await h.render().submit("Review the full scope.", { viaVoice: true });
    for (let i = 0; i < 20 && h.render().speaking; i++) h.finish();
    expect(h.spoken.length).toBeGreaterThan(1);
    expect(h.spoken.every(utterance => utterance.text.length <= 1600)).toBe(true);
    expect(h.spoken.map(utterance => utterance.text).join("")).toBe(answer);
    expect(h.render().speaking).toBe(false);
  } finally { h.dispose(); }
});
