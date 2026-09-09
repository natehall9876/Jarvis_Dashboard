"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, BRAND } from "./nav-config";

export function Sidebar() {
  const pathname = usePathname();
  const BrandIcon = BRAND.icon;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] lg:flex">
      <div className="accent-glow flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-[0_0_0_1px_rgba(45,214,111,0.15)]">
          <BrandIcon className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
            {BRAND.name}
          </div>
          <div className="text-[11px] leading-tight text-[var(--color-text-muted)]">{BRAND.subtitle}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {isActive ? (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] px-5 py-4 text-[11px] text-[var(--color-text-muted)]">
        Jarvis Operations Platform
      </div>
    </aside>
  );
}
