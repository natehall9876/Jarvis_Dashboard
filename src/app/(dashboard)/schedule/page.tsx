import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { JobForm } from "@/components/jobs/job-form";
import { formatCurrency, formatHours, formatTimeString, clientDisplayName, propertyAddress } from "@/lib/format";
import { getJobs, getCrewNamesByJob } from "@/lib/data/jobs";
import { summarizeJobs } from "@/lib/jarvis/briefing";
import { detectScheduleConflicts } from "@/lib/scheduling/conflicts";
import { VALID_JOB_STATUSES } from "@/lib/actions/job-constants";
import { todayInZone } from "@/lib/integrations/homeworks-dates";
import { getPropertyOptions, getServiceOptions, getRouteOptions, getEmployeeOptions } from "@/lib/data/options";
import { createJob } from "@/lib/actions/jobs";
import type { JobWithRelations } from "@/types/domain";

export const dynamic = "force-dynamic";

type ViewMode = "day" | "week";

// All date-only arithmetic here stays in local time deliberately. Parsing a
// "YYYY-MM-DD" param with `new Date(string)` reads it as UTC midnight, and
// `.toISOString()` reads a Date back out the same way — either one alone is
// fine, but round-tripping through `.toLocaleDateString()` (local time) in
// between shifts the displayed day backward for any timezone behind UTC.
// Parsing and formatting entirely in local time sidesteps that.
function parseDateParam(value: string | undefined): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  // "Today" is the business-local (America/New_York) calendar day, never the
  // server's UTC day — after 8 PM Eastern UTC is already tomorrow.
  const [year, month, day] = todayInZone().split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; new?: string; error?: string; status?: string }>;
}) {
  const params = await searchParams;
  const view: ViewMode = params.view === "week" ? "week" : "day";
  const anchor = parseDateParam(params.date);
  const isNew = params.new;
  const statusFilter = (VALID_JOB_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as string) : null;

  const rangeStart = view === "day" ? anchor : startOfWeek(anchor);
  const rangeEnd = view === "day" ? anchor : addDays(rangeStart, 6);

  const [{ data: jobs, error }, properties, services, routes, employees] = await Promise.all([
    getJobs({ from: toISODate(rangeStart), to: toISODate(rangeEnd) }),
    isNew ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isNew ? getServiceOptions() : Promise.resolve({ data: [] }),
    isNew ? getRouteOptions() : Promise.resolve({ data: [] }),
    isNew ? getEmployeeOptions() : Promise.resolve({ data: [] }),
  ]);

  const crewByJob = await getCrewNamesByJob((jobs ?? []).map((j) => j.id));
  const jobsByDate = new Map<string, JobWithRelations[]>();
  for (const job of jobs ?? []) {
    if (!job.scheduled_date) continue;
    if (statusFilter && job.status !== statusFilter) continue;
    const list = jobsByDate.get(job.scheduled_date) ?? [];
    list.push(job);
    jobsByDate.set(job.scheduled_date, list);
  }

  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)) : [anchor];
  const step = view === "week" ? 7 : 1;
  const filterQs = statusFilter ? `&status=${statusFilter}` : "";
  const prevHref = `/schedule?view=${view}&date=${toISODate(addDays(anchor, -step))}${filterQs}`;
  const nextHref = `/schedule?view=${view}&date=${toISODate(addDays(anchor, step))}${filterQs}`;
  const todayHref = `/schedule?view=${view}${filterQs}`;
  const newJobBase = `/schedule?view=${view}&date=${params.date ?? toISODate(anchor)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        description="Day and week views of every job on the board."
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-0.5">
              <Link href={prevHref} className="rounded p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <Link href={todayHref} className="px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                Today
              </Link>
              <Link href={nextHref} className="rounded p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]" aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <ViewToggle current={view} target="day" date={params.date} />
            <ViewToggle current={view} target="week" date={params.date} />
            <Link href={`${newJobBase}&new=1`}>
              <Button>
                <Plus className="h-4 w-4" />
                New Job
              </Button>
            </Link>
          </div>
        }
      />

      <DaySummaryAndFilters
        view={view}
        anchorStr={toISODate(anchor)}
        active={statusFilter}
        summary={summarizeJobs(
          (jobs ?? []).map((j) => ({ status: j.status, price: j.price, budgeted_hours: j.budgeted_hours, scheduled_start_time: j.scheduled_start_time, crewCount: crewByJob[j.id]?.length ?? 0 })),
        )}
      />

      <DataStateGate error={error} isEmpty={false}>
        {/* No page-level empty state: each day already renders its own
            "Nothing scheduled" card, which keeps the date header in view
            instead of losing it behind a generic blanket message. */}
        <div className={view === "week" ? "-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" : ""}>
          <div className={view === "week" ? "grid grid-flow-col auto-cols-[220px] gap-4" : "space-y-3"}>
          {days.map((day) => {
            const dateStr = toISODate(day);
            const dayJobs = jobsByDate.get(dateStr) ?? [];
            const isToday = dateStr === todayInZone();
            const conflicts = detectScheduleConflicts(
              dayJobs.map((j) => ({ id: j.id, label: j.service?.name ?? "Job", crew: crewByJob[j.id] ?? [], scheduledStartTime: j.scheduled_start_time, budgetedHours: j.budgeted_hours })),
            );
            return (
              <div key={dateStr} className={view === "week" ? "min-w-[220px]" : ""}>
                {conflicts.length > 0 ? (
                  <p className="mb-2 rounded-md border border-[var(--color-critical)]/40 bg-[var(--color-critical-soft)] px-2.5 py-1.5 text-[11px] text-[var(--color-critical)]">
                    {conflicts.length} scheduling conflict{conflicts.length === 1 ? "" : "s"}:{" "}
                    {conflicts.map((c) => `${c.crewMember} double-booked ${c.jobA.start}–${c.jobA.end} & ${c.jobB.start}–${c.jobB.end}`).join("; ")}
                  </p>
                ) : null}
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${isToday ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}>
                    {isToday ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> : null}
                    {day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-[var(--color-text-muted)]">
                      {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
                      {dayJobs.length > 0 ? ` · ${formatCurrency(summarizeJobs(dayJobs.map((j) => ({ status: j.status, price: j.price, budgeted_hours: j.budgeted_hours, scheduled_start_time: j.scheduled_start_time, crewCount: crewByJob[j.id]?.length ?? 0 }))).scheduledRevenue)}` : ""}
                    </span>
                    <Link href={`/schedule?view=${view}&date=${dateStr}&new=1`} className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]" aria-label="Add job">
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                <div className="space-y-2">
                  {dayJobs.length === 0 ? (
                    <Card>
                      <CardBody className="py-4 text-center text-xs text-[var(--color-text-muted)]">Nothing scheduled</CardBody>
                    </Card>
                  ) : (
                    dayJobs.map((job) => {
                      const crew = crewByJob[job.id] ?? [];
                      const hasHours = job.budgeted_hours != null && job.budgeted_hours > 0;
                      return (
                        <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                          <Card className="transition-colors hover:border-[var(--color-accent)]">
                            <CardBody className="space-y-1.5 px-3.5 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`min-w-0 truncate text-sm font-semibold ${job.service?.name ? "text-[var(--color-text-primary)]" : "italic text-[var(--color-text-muted)]"}`}>
                                  {job.service?.name ?? "Service not set"}
                                </span>
                                <StatusBadge status={job.status} />
                              </div>
                              <div className="truncate text-sm text-[var(--color-text-secondary)]">{clientDisplayName(job.property?.client)}</div>
                              <div className="truncate text-xs text-[var(--color-text-muted)]">{propertyAddress(job.property)}</div>
                              <div className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
                                <span className={job.scheduled_start_time ? "font-medium text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}>
                                  {job.scheduled_start_time ? formatTimeString(job.scheduled_start_time) : "Unscheduled time"}
                                </span>
                                <span className="text-[var(--color-accent)]">{formatCurrency(job.price)}</span>
                                <span className={hasHours ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"}>
                                  {hasHours ? `${formatHours(job.budgeted_hours)} budgeted` : "Hours: Not set"}
                                </span>
                                <span className={crew.length ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"}>
                                  {crew.length ? crew.join(", ") : "Unassigned"}
                                </span>
                                {job.stop_order != null ? <span className="text-[var(--color-text-muted)]">Stop #{job.stop_order}</span> : null}
                              </div>
                            </CardBody>
                          </Card>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </DataStateGate>

      {isNew ? (
        <Modal title="New Job" closeHref={`/schedule?view=${view}${params.date ? `&date=${params.date}` : ""}`} wide>
          <JobForm
            action={createJob}
            properties={properties.data ?? []}
            services={services.data ?? []}
            routes={routes.data ?? []}
            employees={employees.data ?? []}
            defaultDate={params.date ?? toISODate(anchor)}
            error={params.error}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function ViewToggle({ current, target, date }: { current: ViewMode; target: ViewMode; date?: string }) {
  const href = `/schedule?view=${target}${date ? `&date=${date}` : ""}`;
  const active = current === target;
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {target}
    </Link>
  );
}

function DaySummaryAndFilters({
  view,
  anchorStr,
  active,
  summary,
}: {
  view: ViewMode;
  anchorStr: string;
  active: string | null;
  summary: ReturnType<typeof summarizeJobs>;
}) {
  const base = `/schedule?view=${view}&date=${anchorStr}`;
  const chip = (label: string, status: string | null) => (
    <Link
      key={label}
      href={status ? `${base}&status=${status}` : base}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
        active === status ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="space-y-3">
      <dl className="tabular grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          [view === "week" ? "Jobs this week" : "Jobs", String(summary.jobs), "text-[var(--color-text-primary)]"],
          ["Scheduled revenue", formatCurrency(summary.scheduledRevenue), "text-[var(--color-accent)]"],
          ["Known labor", summary.missingHours === summary.jobs && summary.jobs > 0 ? "None recorded" : `${summary.budgetedHours.toFixed(1)} hr`, summary.missingHours ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"],
          ["No set time", String(summary.unscheduledTime), "text-[var(--color-text-secondary)]"],
          ["Unassigned", String(summary.unassigned), summary.unassigned ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)]/90 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
            <dd className={`text-base font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {chip("All", null)}
        {VALID_JOB_STATUSES.map((st) => chip(st.replace("_", " "), st))}
      </div>
    </div>
  );
}
