"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, BRAND } from "./nav-config";

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
