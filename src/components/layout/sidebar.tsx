"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, BRAND } from "./nav-config";

const groups = [
  { label: "Workspace", paths: ["/", "/schedule", "/jobs", "/routes", "/homeworks"] },
  { label: "Business", paths: ["/clients", "/properties", "/leads", "/quotes", "/invoices", "/money", "/expenses", "/reports"] },
  { label: "Resources", paths: ["/employees", "/equipment"] },
];
export function Sidebar() {
  const pathname = usePathname();
  const BrandIcon = BRAND.icon;
  function navLink(href: string) {
    const item = NAV_ITEMS.find(item => item.href === href)!;
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    const Icon = item.icon;
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}
      className={cn("flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]")}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
    </Link>;
  }
  return (
    <aside className="hidden w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] lg:fixed lg:inset-y-0 lg:left-0 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-6 py-6" aria-label="Jarvis home">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[#102516]"><BrandIcon className="h-5 w-5" /></span>
        <span><span className="block text-xl font-semibold tracking-tight">{BRAND.name}<span className="text-[var(--color-accent)]">.</span></span><span className="block text-[11px] text-[var(--color-text-muted)]">{BRAND.subtitle}</span></span>
      </Link>
      <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-3 pb-5">
        {groups.map(group => <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{group.label}</p>
          <div className="space-y-0.5">{group.paths.map(navLink)}</div>
        </div>)}
      </nav>
      <div className="space-y-1 border-t border-[var(--color-border)] p-3">
        <nav aria-label="Workspace tools">{navLink("/ai-advisor")}{navLink("/settings")}</nav>
        <Link href="/ai-advisor" className="mt-3 flex items-center justify-between rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-3 text-xs text-[var(--color-text-secondary)]">
          <span>What needs your attention?</span><ArrowUpRight className="h-4 w-4 text-[var(--color-accent)]" />
        </Link>
      </div>
    </aside>
  );
}
