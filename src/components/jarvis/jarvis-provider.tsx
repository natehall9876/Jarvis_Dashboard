"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { EntityReference } from "@/lib/ai/tool-types";
import type { ProposedAction } from "@/lib/ai/action-types";
import type { JarvisVisualState } from "@/lib/jarvis/network-engine";
import { parseNavigationIntent, takeSpeakableSentences, toolToCapabilities } from "@/lib/jarvis/voice-utils";
import { deviceMemoryKey, readDeviceMemory, writeDeviceMemory, retainSessionExchanges, toolProgressLabel } from "@/lib/jarvis/device-memory";
import { getFirstJobToday } from "@/lib/actions/jobs";

/**
 * The single, app-wide Jarvis session. It is mounted once in the dashboard
 * layout — which Next.js keeps mounted across client-side navigation — so the
 * conversation, microphone state and speech output survive moving between
 * pages. Nothing here creates a second "voice brain": every utterance, typed
 * or spoken, goes to the same authenticated /api/ai-advisor endpoint and its
 * typed, validated tools. A proposed write still needs an explicit tap on its
 * Confirm button; a transcript is never treated as confirmation.
 *
 * Platform limit, stated plainly: browsers and iOS suspend the microphone and
 * audio when the app is backgrounded or the screen locks. Listening is
 * persistent while the app is open, not in the background.
 */

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: { length: number; [i: number]: SpeechRecognitionResultLike } };
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous?: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort?(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export type Exchange = {
  id: string;
  question: string;
  answer: string | null;
  status: "streaming" | "done" | "error" | "cancelled";
  createdAt: number;
  restored?: boolean;
  error: string | null;
  references: EntityReference[];
  toolsUsed: string[];
  proposedAction: ProposedAction | null;
  viaVoice: boolean;
};

type JarvisContextValue = {
  exchanges: Exchange[];
  visualState: JarvisVisualState;
  interim: string;
  listening: boolean;
  speaking: boolean;
  loading: boolean;
  progress: string | null;
  memoryAvailable: boolean;
  stopResponse: () => void;
  voiceSupported: boolean;
  speechOutputSupported: boolean;
  muted: boolean;
  conversationMode: boolean;
  voiceError: string | null;
  /** Survives clearVoiceError() / a fresh submit() clearing the live banner — the diagnostics view's "last error" needs to outlive the dismissal. */
  lastVoiceError: string | null;
  lastVoiceErrorAt: string | null;
  /** From the Permissions API where supported; "unknown" (not "denied") when the browser can't report it without an active request — Safari/Firefox don't support querying `microphone` this way. */
  micPermission: "granted" | "denied" | "prompt" | "unknown";
  /**
   * The exact final transcript SpeechRecognition produced, set the instant
   * onresult fires with isFinal text — BEFORE submit() does anything with
   * it (parses it as navigation, sends it to the advisor, etc.). This is
   * the single most useful piece of information for telling apart "the mic
   * never captured anything" from "it heard something, just not what was
   * said" from "it heard correctly but the app didn't act on it right" —
   * the conversation panel already shows this as the bubble's question
   * text for a NAVIGATION command, but there was previously no way to see
   * it distinctly from the diagnostics view, and no record at all if
   * something failed before a bubble ever rendered.
   */
  lastTranscript: string | null;
  lastTranscriptAt: string | null;
  panelOpen: boolean;
  activeCapabilities: string[];
  /** The exchange currently shown in the dock's answer bubble (null when none). */
  bubbleId: string | null;
  dismissBubble: () => void;
  clearVoiceError: () => void;
  submit: (text: string, options?: { viaVoice?: boolean }) => Promise<void>;
  retry: (id: string) => void;
  startListening: () => void;
  stopListening: () => void;
  stopSpeaking: () => void;
  toggleMute: () => void;
  toggleConversationMode: () => void;
  setPanelOpen: (open: boolean) => void;
  clear: () => void;
  setActionExecuting: (executing: boolean) => void;
  noteActionSettled: (outcome: "confirmed" | "cancelled") => void;
};

const JarvisContext = createContext<JarvisContextValue | null>(null);

export function useJarvis(): JarvisContextValue {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used inside <JarvisProvider>.");
  return ctx;
}

const ENTITY_PATHS: Partial<Record<EntityReference["type"], string>> = { client: "/clients", property: "/properties", job: "/jobs" };

export function JarvisProvider({ children, pathPrefix = "", memoryOwner = null }: { children: ReactNode; pathPrefix?: string; memoryOwner?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const exchangesRef = useRef<Exchange[]>([]);
  useEffect(() => {
    exchangesRef.current = exchanges;
  }, [exchanges]);

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const requestRef = useRef<{ id: string; abort: AbortController } | null>(null);
  const speechEpochRef = useRef(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [memoryAvailable, setMemoryAvailable] = useState(false);
  const [gotFirstToken, setGotFirstToken] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [conversationMode, setConversationMode] = useState(false);
  const conversationModeRef = useRef(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lastVoiceError, setLastVoiceError] = useState<string | null>(null);
  const [lastVoiceErrorAt, setLastVoiceErrorAt] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [lastTranscriptAt, setLastTranscriptAt] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [actionExecuting, setActionExecuting] = useState(false);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const [activeCapabilities, setActiveCapabilities] = useState<string[]>([]);
  const [bubbleId, setBubbleId] = useState<string | null>(null);
  const dismissBubble = useCallback(() => setBubbleId(null), []);
  const clearVoiceError = useCallback(() => setVoiceError(null), []);
  // Sets both the live (dismissable) banner and the diagnostics view's
  // "last error" together, from the actual event that produced the error —
  // not a derived useEffect watching voiceError, which would set state
  // synchronously inside an effect on every render that changed it.
  const reportVoiceError = useCallback((message: string) => {
    setVoiceError(message);
    setLastVoiceError(message);
    setLastVoiceErrorAt(new Date().toISOString());
  }, []);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speakQueueRef = useRef<string[]>([]);
  const streamDoneRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  // Persisting must not run before the stored session has been read back, or the
  // initial empty list would overwrite it.
  const hydratedRef = useRef(false);
  const memoryResetRef = useRef<string | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Browser capabilities and the persisted session can only be read on the
    // client, after hydration (reading them during render would mismatch the
    // server markup), so they are applied in a deferred callback.
    const init = window.setTimeout(() => {
      setVoiceSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
      setSpeechOutputSupported("speechSynthesis" in window);
      // Discard the previous unscoped session; it must not leak between accounts.
      try {
        window.sessionStorage.removeItem("jarvis.session.v1");
        if (memoryOwner) {
          memoryResetRef.current = window.localStorage.getItem(`${deviceMemoryKey(memoryOwner)}:reset`);
          const saved = readDeviceMemory(window.localStorage.getItem(deviceMemoryKey(memoryOwner)), memoryOwner);
          setExchanges(saved.exchanges);
          exchangesRef.current = saved.exchanges;
          mutedRef.current = saved.muted;
          setMuted(saved.muted);
          window.localStorage.setItem(deviceMemoryKey(memoryOwner), writeDeviceMemory(memoryOwner, saved.exchanges, saved.muted));
          setMemoryAvailable(true);
        }
      } catch { setMemoryAvailable(false); }
      hydratedRef.current = true;
    }, 0);
    const timers = timersRef.current;
    const speechEpoch = speechEpochRef;
    return () => {
      window.clearTimeout(init);
      mountedRef.current = false;
      requestRef.current?.abort.abort();
      requestRef.current = null;
      speechEpoch.current++;
      timers.forEach((t) => window.clearTimeout(t));
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    };
  }, [memoryOwner]);

  useEffect(() => {
    if (!hydratedRef.current || !memoryOwner) return;
    try {
      // A sleeping tab cannot resurrect history cleared elsewhere before its storage event runs.
      if (window.localStorage.getItem(`${deviceMemoryKey(memoryOwner)}:reset`) !== memoryResetRef.current) return;
      window.localStorage.setItem(deviceMemoryKey(memoryOwner), writeDeviceMemory(memoryOwner, exchanges, muted));
    } catch {
      // Storage disabled or full: keep this session usable, report no durable memory.
      later(() => setMemoryAvailable(false), 0);
    }
  }, [exchanges, muted, memoryOwner, later]);

  // Microphone permission state, where the browser can report it without an
  // active getUserMedia/SpeechRecognition request. Chrome/Edge support
  // querying the "microphone" permission name; Safari and Firefox don't
  // (the query throws or the name is unsupported) — reported as "unknown"
  // rather than guessed at, since "unknown" and "denied" call for different
  // owner action (try the mic vs. fix a browser setting).
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const apply = (s: PermissionStatus) => setMicPermission(s.state as "granted" | "denied" | "prompt");
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((s) => {
          if (!mountedRef.current) return;
          status = s;
          apply(s);
          s.onchange = () => apply(s);
        })
        .catch(() => setMicPermission("unknown"));
    }
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // ------------------------------------------------------------------ speech output
  const unlockSpeech = useCallback(() => {
    // iOS Safari only allows speech that begins from a user gesture; speaking
    // an empty utterance inside the tap unlocks later, asynchronous speech.
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // One-time unlock of spoken replies on the very first tap/keypress.
    const unlock = () => {
      unlockSpeech();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [unlockSpeech]);

  const startListeningRef = useRef<() => void>(() => {});
  const pumpRef = useRef<() => void>(() => {});

  const pumpSpeech = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking) return;
    const next = speakQueueRef.current.shift();
    if (!next) {
      setSpeaking(false);
      if (streamDoneRef.current && conversationModeRef.current && !mutedRef.current) {
        const epoch = speechEpochRef.current;
        later(() => { if (epoch === speechEpochRef.current && conversationModeRef.current && !loadingRef.current) startListeningRef.current(); }, 450);
      }
      return;
    }
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = "en-US";
    utterance.rate = 1.03;
    const epoch = speechEpochRef.current;
    utterance.onend = () => { if (epoch === speechEpochRef.current) pumpRef.current(); };
    utterance.onerror = () => {
      if (epoch !== speechEpochRef.current) return;
      speakQueueRef.current = [];
      setSpeaking(false);
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [later]);

  useEffect(() => {
    pumpRef.current = pumpSpeech;
  }, [pumpSpeech]);

  const enqueueSpeech = useCallback(
    (sentences: string[]) => {
      if (mutedRef.current || !sentences.length || !("speechSynthesis" in window)) return;
      speakQueueRef.current.push(...sentences);
      pumpSpeech();
    },
    [pumpSpeech],
  );

  const stopSpeaking = useCallback(() => {
    speechEpochRef.current++;
    speakQueueRef.current = [];
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, []);

  // ------------------------------------------------------------------ advisor
  const patch = useCallback((id: string, update: Partial<Exchange>) => {
    setExchanges((prev) => prev.map((e) => (e.id === id ? { ...e, ...update } : e)));
  }, []);

  const stopResponse = useCallback(() => {
    const current = requestRef.current;
    requestRef.current = null; // Invalidate before abort; an old finally cannot unlock a newer request.
    current?.abort.abort();
    if (current) patch(current.id, { status: "cancelled", error: null, proposedAction: null, references: [], toolsUsed: [] });
    loadingRef.current = false;
    streamDoneRef.current = true;
    conversationModeRef.current = false;
    setConversationMode(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort?.();
    setListening(false);
    setInterim("");
    setLoading(false);
    setGotFirstToken(false);
    setProgress(null);
    setActiveCapabilities([]);
    stopSpeaking();
  }, [patch, stopSpeaking]);

  const finishFlash = useCallback((kind: "success" | "error", ms: number) => {
    setFlash(kind);
    later(() => setFlash(null), ms);
  }, [later]);

  const submit = useCallback(
    async (text: string, options: { viaVoice?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed || loadingRef.current) return;
      const viaVoice = options.viaVoice ?? false;
      if (viaVoice) unlockSpeech();
      stopSpeaking();
      setVoiceError(null);

      const id = crypto.randomUUID();
      setBubbleId(id);
      const base: Exchange = { id, question: trimmed, answer: "", status: "streaming", error: null, references: [], toolsUsed: [], proposedAction: null, viaVoice, createdAt: Date.now() };

      // Deterministic navigation needs no language model.
      const nav = parseNavigationIntent(trimmed);
      if (nav.kind === "route") {
        const reply = `Opening ${nav.target.label}.`;
        setExchanges((prev) => retainSessionExchanges([{ ...base, answer: reply, status: "done" }, ...prev]));
        router.push(pathPrefix + nav.target.href);
        finishFlash("success", 1400);
        if (viaVoice) {
          streamDoneRef.current = true;
          enqueueSpeech([reply]);
        }
        return;
      }

      const request = { id, abort: new AbortController() };
      requestRef.current = request;
      const isCurrent = () => mountedRef.current && requestRef.current === request && !request.abort.signal.aborted;
      loadingRef.current = true;
      setLoading(true);
      setGotFirstToken(false);
      setProgress(nav.kind === "first_job" ? "Checking today's first job" : "Thinking through your request");
      streamDoneRef.current = false;
      setExchanges((prev) => retainSessionExchanges([base, ...prev]));

      const history = exchangesRef.current
        .filter((e) => e.status === "done" && e.answer)
        .slice(0, 6)
        .reverse()
        .map((e) => ({ question: e.question, answer: e.answer as string }));

      let spokenIndex = 0;
      let full = "";
      const deadline = window.setTimeout(() => {
        if (!isCurrent()) return;
        stopResponse();
        patch(id, { status: "error", error: "This request took too long. Try a narrower question.", answer: null });
        finishFlash("error", 3500);
      }, 65_000);
      try {
        if (nav.kind === "first_job") {
          const result = await getFirstJobToday();
          if (!isCurrent()) return;
          const reply = !result.ok ? `Couldn't check today's schedule: ${result.message}` : result.job ? `Opening ${result.job.label}.` : "There's nothing on today's schedule.";
          patch(id, { answer: reply, status: result.ok ? "done" : "error", error: result.ok ? null : result.message });
          if (result.ok && result.job) { router.push(`${pathPrefix}/jobs/${result.job.id}`); finishFlash("success", 1400); }
          if (viaVoice) enqueueSpeech([reply]);
          return;
        }
        const res = await fetch("/api/ai-advisor", {
          method: "POST",
          signal: request.abort.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed, path: pathRef.current, history }),
        });
        if (!isCurrent()) { await res.body?.cancel(); return; }
        if (!res.ok || !res.body) {
          let message = "Something went wrong.";
          try {
            message = ((await res.json()) as { error?: string }).error ?? message;
          } catch {
            // non-JSON error body
          }
          if (!isCurrent()) return;
          patch(id, { status: "error", error: message, answer: null });
          finishFlash("error", 3500);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let settled = false;
        while (true) {
          const { done, value } = await reader.read();
          if (!isCurrent()) { await reader.cancel(); return; }
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;
            const eventName = eventLine.slice(6).trim();
            const data = JSON.parse(dataLine.slice(5).trim());

            if (eventName === "progress" && typeof data.tool === "string") {
              setProgress(toolProgressLabel(data.tool));
              setActiveCapabilities(toolToCapabilities(data.tool));
            } else if (eventName === "delta") {
              setProgress("Putting your answer together");
              setGotFirstToken(true);
              full += data.text;
              setExchanges((prev) => prev.map((e) => (e.id === id ? { ...e, answer: (e.answer ?? "") + data.text } : e)));
              if (viaVoice) {
                const { sentences, nextIndex } = takeSpeakableSentences(full, spokenIndex);
                spokenIndex = nextIndex;
                enqueueSpeech(sentences);
              }
            } else if (eventName === "done") {
              settled = true;
              const answer: string = data.answer ?? full;
              const references: EntityReference[] = data.references ?? [];
              const toolsUsed: string[] = data.toolsUsed ?? [];
              patch(id, { status: "done", answer, references, toolsUsed, proposedAction: data.proposedAction ?? null });
              if (viaVoice) enqueueSpeech(takeSpeakableSentences(answer, spokenIndex, true).sentences);
              const caps = Array.from(new Set(toolsUsed.flatMap(toolToCapabilities)));
              if (caps.length) {
                setActiveCapabilities(caps);
                later(() => { if (!requestRef.current) setActiveCapabilities([]); }, 6000);
              }
              // "Pull up Rob Elliott": navigate only when exactly one record matched.
              if (nav.kind === "entity") {
                const navigable = references.filter((r) => ENTITY_PATHS[r.type]);
                if (navigable.length === 1) router.push(`${pathPrefix}${ENTITY_PATHS[navigable[0].type]}/${navigable[0].id}`);
              }
            } else if (eventName === "error") {
              settled = true;
              patch(id, { status: "error", error: data.error ?? "Something went wrong.", answer: null });
              finishFlash("error", 3500);
            }
          }
        }
        if (!settled) {
          patch(id, { status: "error", error: "The advisor's response stream ended unexpectedly.", answer: null });
          finishFlash("error", 3500);
        }
      } catch {
        if (requestRef.current !== request || !mountedRef.current) return;
        stopSpeaking();
        patch(id, { status: "error", error: request.abort.signal.aborted ? "This request took too long. Try a narrower question." : "Couldn't reach Jarvis. Check your connection and try again.", answer: null });
        finishFlash("error", 3500);
      } finally {
        window.clearTimeout(deadline);
        if (requestRef.current !== request || !mountedRef.current) return;
        requestRef.current = null;
        setProgress(null);
        loadingRef.current = false;
        streamDoneRef.current = true;
        // The bubble fades out on its own once the answer has been readable for a while.
        later(() => setBubbleId((cur) => (cur === id ? null : cur)), 30000);
        if (mountedRef.current) {
          setLoading(false);
          setGotFirstToken(false);
        }
        // If nothing was queued for speech (typed question / error), don't leave the loop waiting.
        if (!speakQueueRef.current.length && !window.speechSynthesis?.speaking) pumpSpeech();
      }
    },
    [enqueueSpeech, later, finishFlash, patch, pathPrefix, pumpSpeech, router, stopResponse, stopSpeaking, unlockSpeech],
  );

  const retry = useCallback(
    (id: string) => {
      const ex = exchangesRef.current.find((e) => e.id === id);
      if (!ex || loadingRef.current) return;
      setExchanges((prev) => prev.filter((e) => e.id !== id));
      void submit(ex.question, { viaVoice: ex.viaVoice });
    },
    [submit],
  );

  // ------------------------------------------------------------------ speech input
  const startListening = useCallback(() => {
    if (loadingRef.current || recognitionRef.current) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      reportVoiceError("Voice input isn't available in this browser session. Type your command, or use your keyboard's dictation microphone in the question field.");
      setPanelOpen(true);
      return;
    }
    stopSpeaking(); // barge-in: talking over Jarvis interrupts it
    setVoiceError(null);
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalSubmitted = false;

    recognition.onresult = (event) => {
      // Some engines repeat final results. A listening session may dispatch
      // exactly one command, including synchronous navigation commands.
      if (finalSubmitted || recognitionRef.current !== recognition) return;
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText.trim()) {
        finalSubmitted = true;
        setInterim("");
        setLastTranscript(finalText.trim());
        setLastTranscriptAt(new Date().toISOString());
        void submit(finalText.trim(), { viaVoice: true });
      } else {
        setInterim(interimText);
      }
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      // Some engines skip onend after an error; release the slot ourselves.
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        reportVoiceError("Microphone access is blocked. Allow the microphone for this site in your browser settings.");
      } else if (event.error === "no-speech") {
        reportVoiceError("Didn't catch that. Tap the mic and try again.");
      } else if (event.error === "network") {
        reportVoiceError("Speech recognition lost its network connection. Check your signal and try again.");
      } else if (event.error !== "aborted") {
        reportVoiceError("Voice input hit an error. Try again or type instead.");
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (mountedRef.current) {
        setListening(false);
        setInterim("");
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, [stopSpeaking, submit, reportVoiceError]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) {
      setListening(false);
      return;
    }
    r.stop();
    // If the engine never fires onend, force-release after a moment.
    later(() => {
      if (recognitionRef.current === r) {
        r.abort?.();
        recognitionRef.current = null;
        setListening(false);
        setInterim("");
      }
    }, 1500);
  }, [later]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopSpeaking();
  }, [stopSpeaking]);

  const toggleConversationMode = useCallback(() => {
    const next = !conversationModeRef.current;
    conversationModeRef.current = next;
    setConversationMode(next);
  }, []);

  const clear = useCallback(() => {
    stopResponse();
    exchangesRef.current = [];
    setExchanges([]);
    setBubbleId(null);
    try {
      if (memoryOwner) {
        memoryResetRef.current = crypto.randomUUID();
        window.localStorage.setItem(`${deviceMemoryKey(memoryOwner)}:reset`, memoryResetRef.current);
        window.localStorage.removeItem(deviceMemoryKey(memoryOwner));
      }
    } catch {
      // ignore
    }
  }, [stopResponse, memoryOwner]);

  useEffect(() => {
    if (!memoryOwner) return;
    const resetFromOtherTab = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== `${deviceMemoryKey(memoryOwner)}:reset`) return;
      memoryResetRef.current = event.newValue;
      stopResponse();
      exchangesRef.current = [];
      setExchanges([]);
      setBubbleId(null);
    };
    window.addEventListener("storage", resetFromOtherTab);
    return () => window.removeEventListener("storage", resetFromOtherTab);
  }, [memoryOwner, stopResponse]);

  const noteActionSettled = useCallback(
    (outcome: "confirmed" | "cancelled") => {
      setActionExecuting(false);
      if (outcome === "confirmed") finishFlash("success", 1800);
      if (outcome === "confirmed") router.refresh();
    },
    [finishFlash, router],
  );

  // The visual state reflects only real, current events.
  const visualState: JarvisVisualState = flash === "error" ? "error" : actionExecuting ? "action" : listening ? "listening" : loading && !gotFirstToken ? "processing" : speaking || loading ? "responding" : flash === "success" ? "success" : "idle";

  const value = useMemo<JarvisContextValue>(
    () => ({
      exchanges,
      visualState,
      interim,
      listening,
      speaking,
      loading,
      progress,
      memoryAvailable,
      stopResponse,
      voiceSupported,
      speechOutputSupported,
      muted,
      conversationMode,
      voiceError,
      lastVoiceError,
      lastVoiceErrorAt,
      micPermission,
      lastTranscript,
      lastTranscriptAt,
      panelOpen,
      activeCapabilities,
      bubbleId,
      dismissBubble,
      clearVoiceError,
      submit,
      retry,
      startListening,
      stopListening,
      stopSpeaking,
      toggleMute,
      toggleConversationMode,
      setPanelOpen,
      clear,
      setActionExecuting,
      noteActionSettled,
    }),
    [
      exchanges,
      visualState,
      interim,
      listening,
      speaking,
      loading,
      progress,
      memoryAvailable,
      stopResponse,
      voiceSupported,
      speechOutputSupported,
      muted,
      conversationMode,
      voiceError,
      lastVoiceError,
      lastVoiceErrorAt,
      micPermission,
      lastTranscript,
      lastTranscriptAt,
      panelOpen,
      activeCapabilities,
      bubbleId,
      dismissBubble,
      clearVoiceError,
      submit,
      retry,
      startListening,
      stopListening,
      stopSpeaking,
      toggleMute,
      toggleConversationMode,
      clear,
      noteActionSettled,
    ],
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}
