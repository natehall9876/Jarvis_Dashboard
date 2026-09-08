import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatHours, clientDisplayName } from "@/lib/format";
import { getJobs, jobProductionRate, type JobFilters } from "@/lib/data/jobs";
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
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filters: JobFilters = status ? { status: status as JobStatus } : {};
  const { data: jobs, error } = await getJobs(filters);

  const columns: Column<JobWithRelations>[] = [
    { key: "date", header: "Date", render: (j) => formatDate(j.scheduled_date) },
    { key: "client", header: "Client", render: (j) => clientDisplayName(j.property?.client) },
    { key: "property", header: "Property", render: (j) => j.property?.street ?? j.property?.property_name ?? "—" },
    { key: "service", header: "Service", render: (j) => j.service?.name ?? "—" },
    { key: "crew_size", header: "Crew Size", align: "right", render: (j) => j.crew_size ?? "—" },
    { key: "price", header: "Price", align: "right", render: (j) => formatCurrency(j.price) },
    { key: "budgeted", header: "Budgeted", align: "right", render: (j) => formatHours(j.budgeted_hours) },
    { key: "actual", header: "Actual", align: "right", render: (j) => formatHours(j.actual_hours) },
    {
      key: "rate",
      header: "$ / Hour",
      align: "right",
      render: (j) => {
        const rate = jobProductionRate(j);
        return rate !== null ? formatCurrency(rate, true) : "—";
      },
    },
    { key: "status", header: "Status", render: (j) => <StatusBadge status={j.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" description="Every job — scheduled, in progress, or completed — with production data." />

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
    </div>
  );
}
