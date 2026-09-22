import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatCurrency, formatDateOnly } from "@/lib/format";

type HistoryJob = { id: string; status: string; service_id: string | null; completed_at: string | null; scheduled_date: string | null; price: number | null };

/**
 * Completed work only, newest first — this is what answers "when did we last
 * do this property" without wading through scheduled/cancelled jobs. Sorts by
 * completed_at when known (real completion timestamp, e.g. from a Homeworks
 * historical import); falls back to scheduled_date for completed jobs logged
 * without one.
 */
export function ServiceHistoryCard({ jobs, serviceNameById, limit = 20 }: { jobs: HistoryJob[]; serviceNameById: Map<string, string>; limit?: number }) {
  const completed = jobs
    .filter((j) => j.status === "completed")
    .sort((a, b) => (b.completed_at ?? b.scheduled_date ?? "").localeCompare(a.completed_at ?? a.scheduled_date ?? ""));

  return (
    <Card>
      <CardHeader title="Service History" description={`${completed.length} completed job${completed.length === 1 ? "" : "s"} on file`} />
      <CardBody>
        {completed.length === 0 ? (
          <EmptyState title="No completed work on file yet" description="Completed jobs, including any imported Homeworks history, appear here." />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {completed.slice(0, limit).map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[var(--color-text-primary)]">{(j.service_id && serviceNameById.get(j.service_id)) || "Service not set"}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatDateOnly(j.completed_at?.slice(0, 10) ?? j.scheduled_date)}</span>
                  </span>
                  <span className="shrink-0 text-[var(--color-accent)]">{formatCurrency(j.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {completed.length > limit ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Showing the {limit} most recent of {completed.length}.</p> : null}
      </CardBody>
    </Card>
  );
}
