import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatDate, formatHours, formatTime } from "@/lib/format";
import { getJobById, jobProductionRate } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: job, error } = await getJobById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!job) return null;

  const rate = jobProductionRate(job);

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.service?.name ?? "Job"}
        description={`${job.client?.name ?? "Unknown client"} — ${job.property?.address_line1 ?? "Unknown property"}`}
        action={<StatusBadge status={job.status} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Price" value={formatCurrency(job.price)} tone="accent" />
        <StatTile label="Budgeted Hours" value={formatHours(job.budgeted_hours)} />
        <StatTile label="Actual Hours" value={formatHours(job.actual_hours)} />
        <StatTile label="Production Rate" value={rate !== null ? formatCurrency(rate, true) + "/hr" : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Schedule" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Client" value={job.client ? <Link href={`/clients/${job.client.id}`} className="text-[var(--color-accent)] hover:underline">{job.client.name}</Link> : "—"} />
            <Row label="Property" value={job.property ? <Link href={`/properties/${job.property.id}`} className="text-[var(--color-accent)] hover:underline">{job.property.address_line1}</Link> : "—"} />
            <Row label="Scheduled Date" value={formatDate(job.scheduled_date)} />
            <Row label="Scheduled Time" value={`${formatTime(job.scheduled_start_time)} – ${formatTime(job.scheduled_end_time)}`} />
            <Row label="Actual Time" value={`${formatTime(job.actual_start_time)} – ${formatTime(job.actual_end_time)}`} />
            <Row label="Crew Lead" value={job.crew_lead ? `${job.crew_lead.first_name} ${job.crew_lead.last_name}` : "—"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Crew" description={`${job.crew.length} assigned`} />
          <CardBody>
            {job.crew.length === 0 ? (
              <EmptyState title="No crew assigned" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {job.crew.map((c) => (
                  <li key={c.id} className="py-2 text-sm text-[var(--color-text-secondary)]">
                    {c.first_name} {c.last_name}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Equipment" description={`${job.equipment.length} used`} />
          <CardBody>
            {job.equipment.length === 0 ? (
              <EmptyState title="No equipment logged" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {job.equipment.map((e) => (
                  <li key={e.id} className="py-2 text-sm text-[var(--color-text-secondary)]">
                    Equipment #{e.equipment_id}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Materials" description={`${job.materials.length} used`} />
          <CardBody>
            {job.materials.length === 0 ? (
              <EmptyState title="No materials logged" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {job.materials.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm text-[var(--color-text-secondary)]">
                    <span>{m.material_name}</span>
                    <span>
                      {m.quantity} {m.unit ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {job.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{job.notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Before / After Photos" description={`${job.photos.length} on file`} />
        <CardBody>
          {job.photos.length === 0 ? (
            <EmptyState title="No photos yet" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {job.photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.photo_url} alt={photo.caption ?? photo.photo_type} className="h-28 w-full object-cover" />
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                    {photo.photo_type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
