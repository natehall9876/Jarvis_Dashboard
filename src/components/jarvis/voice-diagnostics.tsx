"use client";

import { useJarvis } from "@/components/jarvis/jarvis-provider";

function when(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}

const MIC_PERMISSION_LABEL: Record<string, string> = {
  granted: "Granted",
  denied: "Denied — allow the microphone for this site in your browser settings",
  prompt: "Not yet decided — you'll be asked the first time you tap the mic",
  unknown: "Can't be checked ahead of time in this browser — you'll find out when you tap the mic",
};

/**
 * A focused, honest status view — not a marketing panel. Every value here
 * reflects what THIS browser tab can actually observe right now: real
 * capability checks (voiceSupported/speechOutputSupported, set once at
 * mount from window.SpeechRecognition / 'speechSynthesis' in window), the
 * real Permissions API state where the browser supports querying it, the
 * real current voice state the same visualState the dock itself renders
 * from, and the real last error message (already user-safe/redacted — see
 * jarvis-provider.tsx, every voiceError string is a canned, non-sensitive
 * message, never a raw exception dump).
 */
export function VoiceDiagnostics() {
  const jarvis = useJarvis();
  const { voiceSupported, speechOutputSupported, micPermission, visualState, listening, speaking, loading, muted, conversationMode, lastVoiceError, lastVoiceErrorAt, lastTranscript, lastTranscriptAt } = jarvis;

  return (
    <details className="rounded-lg border border-[var(--color-border)] text-xs" data-testid="voice-diagnostics">
      <summary className="cursor-pointer px-3 py-2 font-medium text-[var(--color-text-secondary)]">Voice diagnostics</summary>
      <div className="space-y-1.5 border-t border-[var(--color-border)] px-3 py-2 text-[var(--color-text-secondary)]">
        <Row
          label="Voice input (speech-to-text)"
          value={voiceSupported ? "Supported in this browser" : "Not supported — try Chrome or Edge (iOS/iPadOS doesn't support voice input in any browser; typing still works)"}
        />
        <Row label="Spoken replies (text-to-speech)" value={speechOutputSupported ? "Supported in this browser" : "Not supported in this browser"} />
        <Row label="Microphone permission" value={MIC_PERMISSION_LABEL[micPermission] ?? micPermission} />
        <Row label="Current state" value={`${visualState}${listening ? " (listening)" : ""}${speaking ? " (speaking)" : ""}${loading ? " (waiting on Jarvis)" : ""}`} />
        <Row label="Muted" value={muted ? "Yes — spoken replies are off" : "No"} />
        <Row label="Hands-free mode" value={conversationMode ? "On — listens again automatically after Jarvis finishes speaking" : "Off"} />
        <Row
          label="Last thing heard"
          value={lastTranscript ? `"${lastTranscript}" (${when(lastTranscriptAt)})` : "Nothing captured yet this session"}
        />
        <Row label="Last voice error" value={lastVoiceError ? `${lastVoiceError} (${when(lastVoiceErrorAt)})` : "None recorded this session"} />
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 break-words text-right text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
