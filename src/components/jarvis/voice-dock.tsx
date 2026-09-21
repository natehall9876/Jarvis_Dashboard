"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Mic, Square, Volume2, VolumeX, X } from "lucide-react";
import { AskAdvisor } from "@/components/ai-advisor/ask-advisor";
import { IntelligenceNetwork } from "@/components/jarvis/intelligence-network";
import { useJarvis } from "@/components/jarvis/jarvis-provider";

const STATE_LABEL = {
  idle: "Ask Jarvis",
  listening: "Listening…",
  processing: "Thinking…",
  responding: "Responding…",
  action: "Applying change…",
  success: "Done",
  error: "Something went wrong",
} as const;

/**
 * The persistent Jarvis control. It lives in the dashboard layout, so it — and
 * the conversation behind it — stays mounted while the owner moves between
 * pages. The panel is deliberately NOT closed on navigation: you can ask on
 * the Command Center, open a customer, and keep talking to the same session.
 * (On phones the panel is full width, so it steps aside on navigation and the
 * dock keeps showing live status; the conversation is untouched.)
 */
export function VoiceDock() {
  const pathname = usePathname();
  const jarvis = useJarvis();
  const { panelOpen, setPanelOpen, listening, speaking, loading, visualState, interim, muted, voiceSupported, speechOutputSupported } = jarvis;
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (window.matchMedia("(max-width: 1023px)").matches) setPanelOpen(false);
  }, [pathname, setPanelOpen]);

  const onAdvisorPage = pathname === "/ai-advisor";
  const busy = loading || speaking;
  const status = listening && interim ? interim : STATE_LABEL[visualState];

  function micPress() {
    if (listening) jarvis.stopListening();
    else if (speaking) jarvis.stopSpeaking();
    else jarvis.startListening();
  }

  return (
    <>
      <div
        className="fixed right-3 z-40 flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]/90 p-1.5 pr-2 shadow-[var(--shadow-raised)] backdrop-blur-md lg:right-6 lg:bottom-6"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        role="region"
        aria-label="Jarvis voice"
      >
        <button
          type="button"
          onClick={() => !onAdvisorPage && setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? "Close Jarvis conversation" : "Open Jarvis conversation"}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-0)] ring-1 ring-[var(--color-border-strong)]"
        >
          <IntelligenceNetwork variant="orb" className="h-full w-full" />
        </button>
        <span
          className={`max-w-[9.5rem] truncate text-xs sm:max-w-[13rem] ${visualState === "idle" ? "text-[var(--color-text-secondary)]" : visualState === "error" ? "text-[var(--color-warning)]" : "text-[var(--color-accent)]"}`}
          aria-live="polite"
        >
          {status}
        </span>
        {speechOutputSupported ? (
          <button
            type="button"
            onClick={jarvis.toggleMute}
            aria-label={muted ? "Unmute spoken replies" : "Mute spoken replies"}
            aria-pressed={muted}
            className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] sm:flex"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={micPress}
          disabled={loading && !speaking}
          aria-label={listening ? "Stop listening" : speaking ? "Stop speaking" : voiceSupported ? "Talk to Jarvis" : "Open Jarvis"}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[#062012] transition-transform active:scale-95 disabled:opacity-50 ${
            listening ? "bg-[var(--color-critical)] text-white" : "bg-[var(--color-accent)] shadow-[0_0_28px_-4px_var(--color-accent-glow)]"
          }`}
          onContextMenu={(e) => e.preventDefault()}
        >
          {listening || (speaking && busy) ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
        </button>
      </div>

      {panelOpen && !onAdvisorPage ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close conversation" onClick={() => setPanelOpen(false)} className="pointer-events-auto absolute inset-0 bg-black/60 lg:hidden" />
          <div className="pointer-events-auto relative flex h-full w-full max-w-md flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-[var(--shadow-raised)] animate-fade-in">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 overflow-hidden rounded-full bg-[var(--color-surface-0)] ring-1 ring-[var(--color-border-strong)]">
                  <IntelligenceNetwork variant="orb" className="h-full w-full" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Jarvis</h2>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Conversation continues as you navigate</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
              <AskAdvisor />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
