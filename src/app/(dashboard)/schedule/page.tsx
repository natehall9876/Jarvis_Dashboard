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
import { getJobs } from "@/lib/data/jobs";
import { getPropertyOptions, getServiceOptions, getRouteOptions, getEmployeeOptions } from "@/lib/data/options";
import { createJob } from "@/lib/actions/jobs";
import type { JobWithRelations } from "@/types/domain";

export const dynamic = "force-dynamic";

type ViewMode = "day" | "week";

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
  searchParams: Promise<{ view?: string; date?: string; new?: string; error?: string }>;
}) {
  const params = await searchParams;
  const view: ViewMode = params.view === "week" ? "week" : "day";
  const anchor = params.date && !Number.isNaN(new Date(params.date).getTime()) ? new Date(params.date) : new Date();
  const isNew = params.new;

  const rangeStart = view === "day" ? anchor : startOfWeek(anchor);
  const rangeEnd = view === "day" ? anchor : addDays(rangeStart, 6);

  const [{ data: jobs, error }, properties, services, routes, employees] = await Promise.all([
    getJobs({ from: toISODate(rangeStart), to: toISODate(rangeEnd) }),
    isNew ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isNew ? getServiceOptions() : Promise.resolve({ data: [] }),
    isNew ? getRouteOptions() : Promise.resolve({ data: [] }),
    isNew ? getEmployeeOptions() : Promise.resolve({ data: [] }),
  ]);

  const jobsByDate = new Map<string, JobWithRelations[]>();
  for (const job of jobs ?? []) {
    if (!job.scheduled_date) continue;
    const list = jobsByDate.get(job.scheduled_date) ?? [];
    list.push(job);
    jobsByDate.set(job.scheduled_date, list);
  }

  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)) : [anchor];
  const step = view === "week" ? 7 : 1;
  const prevHref = `/schedule?view=${view}&date=${toISODate(addDays(anchor, -step))}`;
  const nextHref = `/schedule?view=${view}&date=${toISODate(addDays(anchor, step))}`;
  const todayHref = `/schedule?view=${view}`;
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

      <DataStateGate error={error} isEmpty={!!jobs && jobs.length === 0} emptyTitle="No jobs scheduled in this range">
        <div className={view === "week" ? "grid gap-4 lg:grid-cols-7" : "space-y-3"}>
          {days.map((day) => {
            const dateStr = toISODate(day);
            const dayJobs = jobsByDate.get(dateStr) ?? [];
            const isToday = dateStr === toISODate(new Date());
            return (
              <div key={dateStr} className={view === "week" ? "min-w-[220px]" : ""}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${isToday ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"}`}>
                    {isToday ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> : null}
                    {day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">{dayJobs.length} jobs</span>
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
                    dayJobs.map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`}>
                        <Card className="transition-colors hover:border-[var(--color-accent)]">
                          <CardBody className="space-y-1.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                                {formatTimeString(job.scheduled_start_time)}
                              </span>
                              <StatusBadge status={job.status} />
                            </div>
                            <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                              {clientDisplayName(job.property?.client)}
                            </div>
                            <div className="truncate text-xs text-[var(--color-text-secondary)]">
                              {propertyAddress(job.property)} · {job.service?.name ?? "—"}
                            </div>
                            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                              <span>{formatCurrency(job.price)}</span>
                              <span>{formatHours(job.budgeted_hours)} budgeted</span>
                            </div>
                          </CardBody>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
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
