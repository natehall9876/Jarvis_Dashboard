"use client";

import { ArrowUpRight, CalendarDays, CircleDollarSign, ListChecks, LoaderCircle, TrendingUp } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import { WORK_REVIEWS } from "@/lib/jarvis/workspace";

const icons = { operations: ListChecks, collections: CircleDollarSign, sales: TrendingUp, schedule: CalendarDays };
export function WorkReviews() {
  const jarvis = useJarvis();
  const hydrated = useHydrated();
  return <section aria-labelledby="reviews-title" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">Your operations desk</p><h2 id="reviews-title" className="text-xl font-semibold tracking-tight">Put Jarvis to work.</h2></div><p className="max-w-sm text-xs leading-5 text-[var(--color-text-muted)]">Run a focused review of live records. Results open in your conversation; changes require confirmation.</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {WORK_REVIEWS.map(review => {
        const Icon = icons[review.id];
        const last = jarvis.exchanges.find(e => e.question === review.prompt);
        const running = last?.status === "streaming";
        return <article key={review.id} className="flex min-w-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5">
          <div className="flex items-center justify-between gap-3"><span className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5"><Icon className="h-4 w-4 text-[var(--color-accent)]" /></span><span className={`text-[10px] font-medium uppercase tracking-wider ${last?.status === "error" ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"}`}>{running ? "Reviewing" : last?.status === "error" ? "Retry needed" : last?.status === "done" ? "Review complete" : "On demand"}</span></div>
          <h3 className="mt-4 text-sm font-semibold">{review.name}</h3><p className="mt-2 flex-1 text-xs leading-5 text-[var(--color-text-secondary)]">{review.description}</p>
          <button type="button" disabled={!hydrated || jarvis.loading} onClick={() => { jarvis.setPanelOpen(true); void jarvis.submit(review.prompt); }} className="mt-5 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-[var(--color-surface-3)] px-3 text-left text-xs font-medium transition-[background-color,transform] hover:bg-[var(--color-surface-raised)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">{running ? "Checking live records…" : review.label}{running ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" /> : <ArrowUpRight className="h-4 w-4 shrink-0" />}</button>
          {last?.status === "done" && <button type="button" onClick={() => jarvis.setPanelOpen(true)} className="mt-2 min-h-9 text-xs text-[var(--color-accent)]">View conversation</button>}
        </article>;
      })}
    </div>
  </section>;
}
