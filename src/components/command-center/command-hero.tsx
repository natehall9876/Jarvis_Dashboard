"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, Mic, Send } from "lucide-react";
import { IntelligenceNetwork } from "@/components/jarvis/intelligence-network";
import { useHydrated } from "@/lib/use-hydrated";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import type { Briefing } from "@/lib/jarvis/briefing";

const TONE = { ok: "text-[var(--color-accent)]", warn: "text-[var(--color-warning)]", muted: "text-[var(--color-text-secondary)]" } as const;

const STATE_TEXT = {
  idle: "Jarvis is idle",
  listening: "Listening",
  processing: "Thinking",
  responding: "Responding",
  action: "Applying a change",
  success: "Done",
  error: "Something went wrong",
} as const;

/**
 * The Command Center's signature panel: the living network behind a briefing
 * that is composed only from today's real job rows (see lib/jarvis/briefing).
 * If there is no data, it says so instead of inventing a summary.
 */
export function CommandHero({ briefing, dataError }: { briefing: Briefing | null; dataError: string | null }) {
  const jarvis = useJarvis();
  const hydrated = useHydrated();
  const [command, setCommand] = useState("");
  const { visualState, listening } = jarvis;

  return (
    <section aria-label="Jarvis command center" className="relative isolate overflow-hidden rounded-3xl border border-[var(--color-border-strong)] bg-[var(--color-surface-0)] shadow-[var(--shadow-raised)]">
      <IntelligenceNetwork variant="hero" className="absolute inset-y-0 right-0 -z-10 h-full w-full opacity-65 lg:w-[62%]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--color-surface-0)] via-[var(--color-surface-0)]/70 to-transparent sm:via-[var(--color-surface-0)]/45" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-[var(--color-surface-0)]/80 to-transparent" />

      <div className="flex h-full flex-col justify-between gap-7 p-5 sm:p-8 lg:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">WeedEater / Owner workspace</p><Link href="/settings" className="flex min-h-8 items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">Connections<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
        <div className="max-w-2xl space-y-3">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-accent)]">
            <span className={`h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] ${visualState === "idle" ? "" : "animate-pulse"}`} />
            {STATE_TEXT[visualState]}
          </p>
          {briefing ? (
            <>
              <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl">{briefing.greeting}</h1>
              <p className="max-w-lg text-base leading-6 text-[var(--color-text-secondary)]">{briefing.headline}</p>
              {briefing.facts.length > 0 ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pt-2 text-sm">
                  {briefing.facts.map((f) => (
                    <div key={f.label} className="flex flex-col">
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">{f.label}</dt>
                      <dd className={TONE[f.tone]}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : (
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Today&apos;s briefing isn&apos;t available{dataError ? `: ${dataError}` : "."}
            </h2>
          )}
        </div>
        {dataError && briefing && <p role="alert" className="max-w-xl text-sm text-[var(--color-warning)]">{dataError}</p>}
        <form className="flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]/95 p-2 shadow-[var(--shadow-card)] focus-within:border-[var(--color-accent)]" onSubmit={event => {
          event.preventDefault();
          if (!command.trim() || jarvis.loading) return;
          jarvis.setPanelOpen(true); void jarvis.submit(command.trim()); setCommand("");
        }}>
          <label htmlFor="workspace-command" className="sr-only">Ask Jarvis from your workspace</label>
          <input id="workspace-command" value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} disabled={!hydrated || jarvis.loading} placeholder="What needs my attention?" className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-[var(--color-text-muted)] sm:text-sm" />
          <button type="submit" disabled={!hydrated || !command.trim() || jarvis.loading} aria-label="Send to Jarvis" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[#10200c] transition-transform active:scale-95 disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hydrated || jarvis.loading}
            onClick={() => {
              jarvis.setPanelOpen(true);
              if (!listening) jarvis.startListening();
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 text-xs font-semibold text-[#062012] transition-transform active:scale-95 disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            {listening ? "Listening…" : "Talk to Jarvis"}
          </button>
          <Link
            href="/schedule"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]/70 px-4 text-xs font-medium text-[var(--color-text-primary)] hover:border-[var(--color-accent)]/60"
          >
            <CalendarDays className="h-4 w-4" />
            Open schedule
          </Link>
        </div>
      </div>
    </section>
  );
}
