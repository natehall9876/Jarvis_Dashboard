"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarDays, Home, LogOut, Menu, MoreHorizontal, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, BRAND } from "./nav-config";
import { signOut } from "@/app/(auth)/login/actions";

/**
 * The four destinations an owner reaches for constantly while out running
 * the business — everything else (Clients, Properties, Routes, Quotes,
 * Invoices, etc.) stays one tap away behind "More," which opens the same
 * full-list drawer as before. This is a navigation-pattern change only, not
 * a new capability: every route here already exists in NAV_ITEMS.
 */
const TAB_ITEMS = [
  { label: "Today", href: "/", icon: Home },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Ask Jarvis", href: "/ai-advisor", icon: Sparkles },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const BrandIcon = BRAND.icon;

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <BrandIcon className="h-4 w-4" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{BRAND.name}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Fixed bottom tab bar — the primary way to move around one-handed
          in the field. Safe-area-aware so it clears the home indicator on
          notched phones instead of the last tab sitting under it. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--color-border)] bg-[var(--color-surface-1)]/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TAB_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 2} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
          More
        </button>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[80vw] overflow-y-auto bg-[var(--color-surface-1)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{BRAND.name}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                      isActive
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <form action={signOut} className="mt-4 border-t border-[var(--color-border)] pt-4">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
                Sign out
              </button>
            </form>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="flex-1 bg-black/60"
            onClick={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
