import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatHours, formatTime, formatWeekdayDateOnly, clientDisplayName, propertyAddress } from "@/lib/format";
import type { TodaysMission as TodaysMissionData } from "@/lib/data/command-center";
import {
  AlertTriangle,
  Ban,
  CircleDollarSign,
  Clock,
  FileClock,
  ReceiptText,
  Route as RouteIcon,
  Users,
  Wrench,
} from "lucide-react";

const severityIconClass: Record<"critical" | "warning" | "info", string> = {
  critical: "text-[var(--color-critical)]",
  warning: "text-[var(--color-warning)]",
  info: "text-[var(--color-info)]",
};

export function TodaysMission({
  data,
  error,
}: {
  data: TodaysMissionData | null;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader
        title="Today's Mission"
        description={data ? formatWeekdayDateOnly(data.date) : undefined}
      />
      <CardBody>
        <DataStateGate
          error={error}
          isEmpty={!!data && data.jobCount === 0 && data.priorities.length === 0}
          emptyTitle="No jobs scheduled today"
          emptyDescription="Nothing on the board yet — check Schedule to add jobs."
        >
          {data ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile
                  label="Jobs Today"
                  value={data.jobCount}
                  icon={<Clock className="h-4 w-4" />}
                />
                <StatTile
                  label="Expected Revenue"
                  value={formatCurrency(data.expectedRevenue)}
                  icon={<CircleDollarSign className="h-4 w-4" />}
                  tone="accent"
                />
                <StatTile
                  label="Budgeted Hours"
                  value={formatHours(data.budgetedHours)}
                  icon={<FileClock className="h-4 w-4" />}
                />
                <StatTile
                  label="Crew Working"
                  value={data.crewWorking.length}
                  sublabel={data.crewWorking.map((c) => c.name).join(", ") || "Unassigned"}
                  icon={<Users className="h-4 w-4" />}
                />
              </div>

              {data.jobs.length > 0 ? (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Today&apos;s Jobs
                  </h3>
                  <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                    {data.jobs.map((job) => (
                      <li key={job.id}>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                        >
                          <span className="w-16 shrink-0 text-xs text-[var(--color-text-muted)]">{formatTime(job.scheduled_start_time)}</span>
                          <span className="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
                            {clientDisplayName(job.property?.client)} <span className="text-[var(--color-text-muted)]">· {job.service?.name ?? "—"}</span>
                          </span>
                          <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{formatCurrency(job.price)}</span>
                          <StatusBadge status={job.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.priorities.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Priorities
                  </h3>
                  <ul className="space-y-1.5">
                    {data.priorities.map((p) => (
                      <li key={p.label}>
                        <Link
                          href={p.href}
                          className="flex items-center gap-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-3)]"
                        >
                          <AlertTriangle className={`h-4 w-4 shrink-0 ${severityIconClass[p.severity]}`} />
                          <span className="font-medium text-[var(--color-text-primary)]">{p.label}</span>
                          <span className="text-[var(--color-text-muted)]">— {p.detail}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <MissionList
                  title="Schedule Changes"
                  icon={<Ban className="h-3.5 w-3.5" />}
                  emptyText="No cancellations or skips today"
                >
                  {data.scheduleChanges.map((job) => (
                    <li key={job.id}>
                      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-[var(--color-accent)]">
                        <span className="truncate text-[var(--color-text-secondary)]">
                          {clientDisplayName(job.property?.client)} — {propertyAddress(job.property)}
                        </span>
                        <StatusBadge status={job.status} />
                      </Link>
                    </li>
                  ))}
                </MissionList>

                <MissionList
                  title="Quotes Needing Follow-up"
                  icon={<ReceiptText className="h-3.5 w-3.5" />}
                  emptyText="No stale quotes"
                  href="/quotes"
                >
                  {data.quotesNeedingFollowUp.map((quote) => (
                    <li key={quote.id}>
                      <Link href={`/quotes/${quote.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-[var(--color-accent)]">
                        <span className="truncate text-[var(--color-text-secondary)]">
                          {clientDisplayName(quote.client)} — {quote.quote_number}
                        </span>
                        <span className="text-[var(--color-text-muted)]">{formatTime(quote.sent_at)}</span>
                      </Link>
                    </li>
                  ))}
                </MissionList>

                <MissionList
                  title="Overdue Invoices"
                  icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                  emptyText="Nothing overdue"
                  href="/invoices"
                >
                  {data.overdueInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-[var(--color-accent)]">
                        <span className="truncate text-[var(--color-text-secondary)]">
                          {clientDisplayName(inv.client)} — #{inv.invoice_number}
                        </span>
                        <Badge tone="critical">{formatCurrency(inv.balance)}</Badge>
                      </Link>
                    </li>
                  ))}
                </MissionList>

                <MissionList
                  title="Equipment Issues"
                  icon={<Wrench className="h-3.5 w-3.5" />}
                  emptyText="All equipment operational"
                  href="/equipment"
                >
                  {data.equipmentIssues.map((eq) => (
                    <li key={eq.id}>
                      <Link href={`/equipment/${eq.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-[var(--color-accent)]">
                        <span className="truncate text-[var(--color-text-secondary)]">{eq.name}</span>
                        <StatusBadge status={eq.status ?? "active"} />
                      </Link>
                    </li>
                  ))}
                </MissionList>
              </div>

              {data.routesRunning.length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <RouteIcon className="h-3.5 w-3.5" />
                  {data.routesRunning.length} route{data.routesRunning.length === 1 ? "" : "s"} running today —{" "}
                  <Link href="/routes" className="text-[var(--color-accent)] hover:underline">
                    view routes
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </DataStateGate>
      </CardBody>
    </Card>
  );
}

function MissionList({
  title,
  icon,
  emptyText,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  href?: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {icon}
          {title}
        </div>
        {href ? (
          <Link href={href} className="text-xs text-[var(--color-accent)] hover:underline">
            View all
          </Link>
        ) : null}
      </div>
      {hasChildren ? (
        <ul className="divide-y divide-[var(--color-border)]">{children}</ul>
      ) : (
        <p className="py-1.5 text-sm text-[var(--color-text-muted)]">{emptyText}</p>
      )}
    </div>
  );
}
