import { LoaderCircle } from "lucide-react";

export default function DashboardLoading() {
  return <div role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-7xl space-y-5">
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 sm:p-8">
      <p className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="h-4 w-4 animate-spin text-[var(--color-accent)] motion-reduce:animate-none" />Loading your workspace…</p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">Reading current records. Your navigation and Jarvis conversation remain available.</p>
      <div aria-hidden="true" className="mt-8 space-y-3 motion-safe:animate-pulse"><div className="h-8 w-2/3 rounded-lg bg-[var(--color-surface-3)]" /><div className="h-4 w-1/2 rounded bg-[var(--color-surface-2)]" /></div>
    </div>
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-36 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]" />)}</div>
  </div>;
}
