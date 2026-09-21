"use client";

import Link from "next/link";
import { CalendarDays, Mic } from "lucide-react";
import { IntelligenceNetwork } from "@/components/jarvis/intelligence-network";
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
  const { visualState, listening } = jarvis;

  return (
    <section className="relative isolate min-h-[340px] overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-0)] shadow-[var(--shadow-raised)] sm:min-h-[380px]">
      <IntelligenceNetwork variant="hero" className="absolute inset-y-0 right-0 -z-10 h-full w-full lg:w-[74%]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--color-surface-0)] via-[var(--color-surface-0)]/70 to-transparent sm:via-[var(--color-surface-0)]/45" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-[var(--color-surface-0)]/80 to-transparent" />

      <div className="flex h-full flex-col justify-between gap-6 p-5 sm:p-8">
        <div className="max-w-xl space-y-3">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-accent)]">
            <span className={`h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] ${visualState === "idle" ? "" : "animate-pulse"}`} />
            {STATE_TEXT[visualState]}
          </p>
          {briefing ? (
            <>
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-3xl">
                {briefing.greeting} <span className="text-[var(--color-text-secondary)]">{briefing.headline}</span>
              </h2>
              {briefing.facts.length > 0 ? (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 pt-1 text-sm sm:grid-cols-2">
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              jarvis.setPanelOpen(true);
              if (!listening) jarvis.startListening();
            }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 text-sm font-semibold text-[#062012] shadow-[0_0_28px_-6px_var(--color-accent-glow)] transition-transform active:scale-95"
          >
            <Mic className="h-4 w-4" />
            {listening ? "Listening…" : "Talk to Jarvis"}
          </button>
          <Link
            href="/schedule"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]/70 px-5 text-sm font-medium text-[var(--color-text-primary)] backdrop-blur hover:border-[var(--color-accent)]/60"
          >
            <CalendarDays className="h-4 w-4" />
            Open schedule
          </Link>
        </div>
      </div>
    </section>
  );
}
