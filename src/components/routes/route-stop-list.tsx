"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { formatCurrency, formatHours, clientDisplayName, propertyAddress } from "@/lib/format";
import { moveRouteStop } from "@/app/(dashboard)/routes/actions";
import type { RouteWithStops } from "@/types/domain";

type Stop = RouteWithStops["stops"][number];

export function RouteStopList({ routeId, stops }: { routeId: string; stops: Stop[] }) {
  const [ordered, setOrdered] = useState(stops);
  const [isPending, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);

    const updates = next.map((stop, i) => ({ id: stop.id, stop_order: i }));
    startTransition(() => {
      moveRouteStop(routeId, updates).catch(() => setOrdered(stops));
    });
  }

  if (ordered.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">No stops on this route yet.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {ordered.map((stop, i) => (
        <li key={stop.id} className="flex items-center gap-3 py-2.5">
          <GripVertical className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <span className="w-6 shrink-0 text-xs font-medium text-[var(--color-text-muted)]">{i + 1}</span>
          <div className="min-w-0 flex-1">
            {stop.property ? (
              <Link href={`/properties/${stop.property.id}`} className="block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">
                {propertyAddress(stop.property)}
              </Link>
            ) : (
              <span className="text-sm text-[var(--color-text-muted)]">Unknown property</span>
            )}
            <span className="text-xs text-[var(--color-text-muted)]">
              {clientDisplayName(stop.property?.client)}
            </span>
          </div>
          <span className="w-20 shrink-0 text-right text-sm text-[var(--color-text-secondary)]">
            {formatCurrency(stop.estimated_price)}
          </span>
          <span className="w-16 shrink-0 text-right text-sm text-[var(--color-text-secondary)]">
            {formatHours(stop.budgeted_hours)}
          </span>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0 || isPending}
              aria-label="Move up"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === ordered.length - 1 || isPending}
              aria-label="Move down"
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)] disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
