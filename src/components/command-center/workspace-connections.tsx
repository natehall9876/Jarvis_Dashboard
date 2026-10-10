"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, CircleDollarSign, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import type { WorkspaceReadiness } from "@/lib/jarvis/workspace";

export function WorkspaceConnections() {
  const [data, setData] = useState<WorkspaceReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const { exchanges } = useJarvis();
  // Navigation does not test the AI. Only an exchange with actual business tools qualifies.
  const lastAI = exchanges.find(e => e.status === "error" || (e.toolsUsed.length > 0 && e.status === "done"));
  const check = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/integrations/health", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]) });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to verify your connections." : "Connection checks are unavailable. Retry or open Connections.");
      const result = await response.json();
      if (!Array.isArray(result.services) || typeof result.checkedAt !== "string") throw new Error("Connection checks returned an incomplete response.");
      if (!controller.signal.aborted) setData(result);
    } catch (e) {
      if (!controller.signal.aborted) { setData(null); setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Connection checks timed out. Your saved data has not been changed."); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void check(), 0); return () => { clearTimeout(timer); request.current?.abort(); }; }, [check]);
  return <section aria-labelledby="connections-title" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 id="connections-title" className="text-sm font-semibold">Connection health</h2><p className="mt-1 text-xs text-[var(--color-text-muted)]">{data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET · Homeworks freshness is shown above` : "Checking each service independently"}</p></div>
      <button type="button" onClick={() => { setLoading(true); setError(null); void check(); }} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />{loading ? "Checking…" : "Recheck"}</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-[var(--color-warning)] p-4 text-sm text-[var(--color-warning)]">{error} <Link href="/settings" className="underline">Open Connections</Link></p>}
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-busy={loading}>
      {data?.services.map(service => {
        const aiChecked = service.id === "ai" && lastAI;
        const state = aiChecked ? lastAI.status === "done" ? "live" : "attention" : service.state;
        const detail = aiChecked ? lastAI.status === "done" ? "A business-data answer completed in this session. Each new request is checked again." : "The last business-data answer failed. Open Ask Jarvis to retry." : service.detail;
        const Icon = service.id === "ai" ? Sparkles : service.id === "quickbooks" ? CircleDollarSign : CalendarDays;
        const color = state === "live" ? "text-[var(--color-accent)]" : state === "ready" ? "text-[var(--color-text-secondary)]" : "text-[var(--color-warning)]";
        return <Link key={service.id} href={service.id === "ai" ? "/ai-advisor" : "/settings"} className="hud-panel group min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 transition-colors hover:border-[var(--color-border-strong)]">
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />{service.name}</span><ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" /></div>
          <p className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${color}`}>{state === "live" ? <CheckCircle2 className="h-3.5 w-3.5" /> : state !== "ready" ? <TriangleAlert className="h-3.5 w-3.5" /> : null}{state === "live" ? "Verified read" : state === "ready" ? "Ready to ask" : state === "setup" ? "Setup needed" : "Needs attention"}</p>
          <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">{detail}</p>
        </Link>;
      })}
      {!data && loading && ["Jarvis AI", "QuickBooks", "Google Calendar"].map(name => <div key={name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4"><p className="text-sm font-medium">{name}</p><p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-muted)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Checking access…</p></div>)}
    </div>
  </section>;
}
