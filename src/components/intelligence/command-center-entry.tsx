import Link from 'next/link';
import { ArrowUpRight, Telescope } from 'lucide-react';

export function IntelligenceEntry() {
  return <Link href="/intelligence" className="flex min-h-20 items-center gap-4 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-4 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] active:scale-[0.99]">
    <Telescope className="h-5 w-5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Business intelligence</h2><p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Review current decisions, prepared work, and research opportunities.</p></div><ArrowUpRight className="h-5 w-5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
  </Link>;
}
