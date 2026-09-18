import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { formatCurrency, formatHours, parseDateOnly } from "@/lib/format";
import { CalendarDays } from "lucide-react";
import type { WorkloadSummary } from "@/lib/data/jobs";

const shortDateFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * The Command Center previously only showed *today* (Today's Mission) —
 * nothing forward-looking. For a lawn care business this matters a lot
 * going into fall: cleanups get scheduled days or weeks out, and there was
 * no way to see that from the Command Center without navigating to
 * Schedule and manually stepping through days. Reuses getWorkloadSummary,
 * the same deterministic day-by-day rollup already built and tested for
 * the AI Advisor's "is this week overloaded" tool — no new calculation
 * logic, just a new place real data already being computed gets shown.
 */
export function UpcomingWork({ data, error }: { data: WorkloadSummary | null; error: string | null }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[var(--color-accent)]" />
            Upcoming Work
          </span>
        }
        description="Next 7 days"
      />
      <CardBody>
        <DataStateGate
          error={error}
          isEmpty={!!data && data.days.length === 0}
          emptyTitle="Nothing scheduled in the next 7 days"
          emptyDescription="Add jobs on the Schedule page to see them here."
        >
          {data ? (
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
              {data.days.map((day) => {
                const parsed = parseDateOnly(day.date);
                return (
                  <li key={day.date}>
                    <Link
                      href={`/schedule?view=day&date=${day.date}`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                      <span className="w-24 shrink-0 text-[var(--color-text-primary)]">{parsed ? shortDateFormatter.format(parsed) : day.date}</span>
                      <span className="flex-1 text-[var(--color-text-secondary)]">
                        {day.job_count} job{day.job_count === 1 ? "" : "s"}
                        {day.crew_assigned.length > 0 ? ` · ${day.crew_assigned.join(", ")}` : " · Unassigned"}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{formatHours(day.budgeted_hours)}</span>
                      <span className="shrink-0 font-medium text-[var(--color-accent)]">{formatCurrency(day.expected_revenue)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </DataStateGate>
      </CardBody>
    </Card>
  );
}
