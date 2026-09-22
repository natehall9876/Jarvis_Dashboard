"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { EntityReference } from "@/lib/ai/tool-types";
import type { ProposedAction } from "@/lib/ai/action-types";
import type { JarvisVisualState } from "@/lib/jarvis/network-engine";
import { parseNavigationIntent, takeSpeakableSentences, toolToCapabilities } from "@/lib/jarvis/voice-utils";

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
  status: "streaming" | "done" | "error";
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

const STORAGE_KEY = "jarvis.session.v1";
const ENTITY_PATHS: Partial<Record<EntityReference["type"], string>> = { client: "/clients", property: "/properties", job: "/jobs" };

function loadPersisted(): Exchange[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Exchange[];
    // A restored exchange never carries a live proposed action: a stale Confirm
    // button must not survive a reload.
    return parsed.filter((e) => e.status === "done").map((e) => ({ ...e, proposedAction: null })).slice(0, 20);
  } catch {
    return [];
  }
}

export function JarvisProvider({ children, pathPrefix = "" }: { children: ReactNode; pathPrefix?: string }) {
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
      setExchanges(loadPersisted());
      hydratedRef.current = true;
    }, 0);
    const timers = timersRef.current;
    return () => {
      window.clearTimeout(init);
      mountedRef.current = false;
      timers.forEach((t) => window.clearTimeout(t));
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      const done = exchanges.filter((e) => e.status === "done").slice(0, 20);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      // Storage unavailable (private mode, quota) — the live session still works.
    }
  }, [exchanges]);

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
      if (streamDoneRef.current && conversationModeRef.current && !mutedRef.current) later(() => startListeningRef.current(), 450);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = "en-US";
    utterance.rate = 1.03;
    utterance.onend = () => pumpRef.current();
    utterance.onerror = () => {
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
      const base: Exchange = { id, question: trimmed, answer: "", status: "streaming", error: null, references: [], toolsUsed: [], proposedAction: null, viaVoice };

      // Deterministic navigation needs no language model.
      const nav = parseNavigationIntent(trimmed);
      if (nav.kind === "route") {
        const reply = `Opening ${nav.target.label}.`;
        setExchanges((prev) => [{ ...base, answer: reply, status: "done" }, ...prev]);
        router.push(pathPrefix + nav.target.href);
        finishFlash("success", 1400);
        if (viaVoice) {
          streamDoneRef.current = true;
          enqueueSpeech([reply]);
        }
        return;
      }

      loadingRef.current = true;
      setLoading(true);
      setGotFirstToken(false);
      streamDoneRef.current = false;
      setExchanges((prev) => [base, ...prev]);

      const history = exchangesRef.current
        .filter((e) => e.status === "done" && e.answer)
        .slice(0, 6)
        .reverse()
        .map((e) => ({ question: e.question, answer: e.answer as string }));

      let spokenIndex = 0;
      let full = "";
      try {
        const res = await fetch("/api/ai-advisor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed, path: pathRef.current, history }),
        });
        if (!res.ok || !res.body) {
          let message = "Something went wrong.";
          try {
            message = ((await res.json()) as { error?: string }).error ?? message;
          } catch {
            // non-JSON error body
          }
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

            if (eventName === "delta") {
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
                later(() => setActiveCapabilities([]), 6000);
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
        patch(id, { status: "error", error: "Couldn't reach Jarvis. Check your connection and try again.", answer: null });
        finishFlash("error", 3500);
      } finally {
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
    [enqueueSpeech, later, finishFlash, patch, pathPrefix, pumpSpeech, router, stopSpeaking, unlockSpeech],
  );

  const retry = useCallback(
    (id: string) => {
      const ex = exchangesRef.current.find((e) => e.id === id);
      if (!ex) return;
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
      reportVoiceError("Voice input isn't supported in this browser. Use Chrome, Edge, or Safari, or type instead.");
      return;
    }
    stopSpeaking(); // barge-in: talking over Jarvis interrupts it
    setVoiceError(null);
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText.trim()) {
        setInterim("");
        void submit(finalText.trim(), { viaVoice: true });
      } else {
        setInterim(interimText);
      }
    };
    recognition.onerror = (event) => {
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
    stopSpeaking();
    setExchanges([]);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [stopSpeaking]);

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
      voiceSupported,
      speechOutputSupported,
      muted,
      conversationMode,
      voiceError,
      lastVoiceError,
      lastVoiceErrorAt,
      micPermission,
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
      voiceSupported,
      speechOutputSupported,
      muted,
      conversationMode,
      voiceError,
      lastVoiceError,
      lastVoiceErrorAt,
      micPermission,
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
