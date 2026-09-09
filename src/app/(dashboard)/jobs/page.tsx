import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { JobForm } from "@/components/jobs/job-form";
import { formatCurrency, formatDateOnly, formatHours, clientDisplayName } from "@/lib/format";
import { getJobs, jobProductionRate, type JobFilters } from "@/lib/data/jobs";
import { getPropertyOptions, getServiceOptions, getRouteOptions, getEmployeeOptions } from "@/lib/data/options";
import { createJob } from "@/lib/actions/jobs";
import type { JobStatus, JobWithRelations } from "@/types/domain";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { label: string; value: JobStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Skipped", value: "skipped" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; new?: string; error?: string }>;
}) {
  const { status, new: isNew, error: formError } = await searchParams;
  const filters: JobFilters = status ? { status: status as JobStatus } : {};
  const [{ data: jobs, error }, properties, services, routes, employees] = await Promise.all([
    getJobs(filters),
    isNew ? getPropertyOptions() : Promise.resolve({ data: [] }),
    isNew ? getServiceOptions() : Promise.resolve({ data: [] }),
    isNew ? getRouteOptions() : Promise.resolve({ data: [] }),
    isNew ? getEmployeeOptions() : Promise.resolve({ data: [] }),
  ]);

  const columns: Column<JobWithRelations>[] = [
    { key: "date", header: "Date", render: (j) => formatDateOnly(j.scheduled_date) },
    { key: "client", header: "Client", render: (j) => clientDisplayName(j.property?.client) },
    { key: "property", header: "Property", render: (j) => j.property?.street ?? j.property?.property_name ?? "—" },
    { key: "service", header: "Service", render: (j) => j.service?.name ?? "—" },
    { key: "crew_size", header: "Crew Size", align: "right", hideOnMobile: true, render: (j) => j.crew_size ?? "—" },
    { key: "price", header: "Price", align: "right", render: (j) => formatCurrency(j.price) },
    { key: "budgeted", header: "Budgeted", align: "right", hideOnMobile: true, render: (j) => formatHours(j.budgeted_hours) },
    { key: "actual", header: "Actual", align: "right", hideOnMobile: true, render: (j) => formatHours(j.actual_hours) },
    {
      key: "rate",
      header: "$ / Hour",
      align: "right",
      hideOnMobile: true,
      render: (j) => {
        const rate = jobProductionRate(j);
        return rate !== null ? formatCurrency(rate, true) : "—";
      },
    },
    { key: "status", header: "Status", render: (j) => <StatusBadge status={j.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description="Every job — scheduled, in progress, or completed — with production data."
        action={
          <Link href="/jobs?new=1">
            <Button>
              <Plus className="h-4 w-4" />
              Create Job
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <a
            key={f.label}
            href={f.value ? `/jobs?status=${f.value}` : "/jobs"}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === f.value || (!status && !f.value)
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <Card>
        <DataStateGate error={error} isEmpty={!!jobs && jobs.length === 0} emptyTitle="No jobs found">
          {jobs ? <DataTable columns={columns} rows={jobs} getRowKey={(j) => j.id} onRowHref={(j) => `/jobs/${j.id}`} /> : null}
        </DataStateGate>
      </Card>

      {isNew ? (
        <Modal title="Create Job" closeHref="/jobs" wide>
          <JobForm
            action={createJob}
            properties={properties.data ?? []}
            services={services.data ?? []}
            routes={routes.data ?? []}
            employees={employees.data ?? []}
            error={formError}
          />
        </Modal>
      ) : null}
    </div>
  );
}
