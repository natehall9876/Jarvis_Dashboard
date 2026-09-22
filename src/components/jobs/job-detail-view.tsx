import Link from "next/link";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { JobForm } from "@/components/jobs/job-form";
import { StatusQuickChange } from "@/components/jobs/status-quick-change";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatDateOnly, formatHours, formatTime, formatTimeString, clientDisplayName, propertyAddress } from "@/lib/format";
import { jobProductionRate, type JobDetail } from "@/lib/data/jobs";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import { PhotoGrid } from "@/components/photos/photo-grid";
import { JobNotes } from "@/components/jobs/job-notes";
import type { JobNote } from "@/lib/data/notes-tasks";
import type { ActivityEvent } from "@/lib/data/activity-log";

/**
 * The job detail page's actual view, extracted from
 * src/app/(dashboard)/jobs/[id]/page.tsx so it can be rendered with fixture
 * data (the mobile review harness at /voice-lab/jobs/[id]) without
 * duplicating this JSX by hand — a hand-copied twin would silently drift
 * from the real page the first time either one changes. The real page is
 * now a thin data-fetching wrapper around this component; this IS the real
 * page's UI, not a lookalike.
 */
export function JobDetailView({
  id,
  job,
  photoUrls,
  photoUrlsError,
  activity,
  jobNotes,
  isEditing,
  formError,
  properties,
  services,
  routes,
  employees,
  updateJobAction,
  changeStatusAction,
}: {
  id: string;
  job: JobDetail;
  photoUrls: Map<string, string>;
  photoUrlsError: string | null;
  activity: ActivityEvent[];
  jobNotes: { data: JobNote[]; needsMigration: boolean; error: string | null };
  isEditing: boolean;
  formError?: string;
  properties: { id: string; label: string }[];
  services: { id: string; name: string; default_price: number | null; default_budgeted_hours: number | null }[];
  routes: { id: string; name: string }[];
  employees: { id: string; label: string }[];
  updateJobAction: (formData: FormData) => void;
  changeStatusAction: (formData: FormData) => void;
}) {
  const rate = jobProductionRate(job);
  const client = job.property?.client ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.service?.name ?? "Service not set"}
        description={`${clientDisplayName(client)} — ${propertyAddress(job.property)}`}
        action={
          <div className="flex items-center gap-2">
            <StatusQuickChange action={changeStatusAction} currentStatus={job.status} />
            <Link href={`/jobs/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Price" value={formatCurrency(job.price)} tone="accent" />
        <StatTile label="Budgeted Hours" value={formatHours(job.budgeted_hours)} />
        <StatTile label="Actual Hours" value={formatHours(job.actual_hours)} />
        <StatTile label="Production Rate" value={rate !== null ? formatCurrency(rate, true) + "/hr" : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Schedule" />
          <CardBody className="space-y-2 text-sm">
            <Row label="Client" value={client ? <Link href={`/clients/${client.id}`} className="text-[var(--color-accent)] hover:underline">{clientDisplayName(client)}</Link> : "—"} />
            <Row label="Property" value={job.property ? <Link href={`/properties/${job.property.id}`} className="text-[var(--color-accent)] hover:underline">{propertyAddress(job.property)}</Link> : "—"} />
            <Row label="Scheduled Date" value={formatDateOnly(job.scheduled_date)} />
            <Row label="Scheduled Start" value={job.scheduled_start_time ? formatTimeString(job.scheduled_start_time) : "Unscheduled time"} />
            <Row label="Started" value={formatTime(job.started_at)} />
            <Row label="Completed" value={formatTime(job.completed_at)} />
            <Row label="Planned Crew Size" value={job.crew_size ?? "—"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Crew" description={job.sectionErrors.crew ? undefined : `${job.crew.length} assigned`} />
          <CardBody>
            {job.sectionErrors.crew ? (
              <ErrorState title="Couldn't load crew" description={job.sectionErrors.crew} />
            ) : job.crew.length === 0 ? (
              <EmptyState title="No crew assigned" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {job.crew.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/employees/${c.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span>
                      <span>{formatHours(c.hours_worked)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Equipment" description={job.sectionErrors.equipment ? undefined : `${job.equipment.length} used`} />
          <CardBody>
            {job.sectionErrors.equipment ? (
              <ErrorState title="Couldn't load equipment" description={job.sectionErrors.equipment} />
            ) : job.equipment.length === 0 ? (
              <EmptyState title="No equipment logged" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {job.equipment.map((e, i) => (
                  <li key={i}>
                    {e.equipment ? (
                      <Link
                        href={`/equipment/${e.equipment.id}`}
                        className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                      >
                        <span>{e.equipment.name}</span>
                        <span>{formatHours(e.hours_used)}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between px-2 py-2 text-sm text-[var(--color-text-secondary)]">
                        <span>Unknown equipment</span>
                        <span>{formatHours(e.hours_used)}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Materials" description={job.sectionErrors.materials ? undefined : `${job.materials.length} used`} />
          <CardBody>
            {job.sectionErrors.materials ? (
              <ErrorState title="Couldn't load materials" description={job.sectionErrors.materials} />
            ) : job.materials.length === 0 ? (
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

      {job.completion_notes ? (
        <Card>
          <CardHeader title="Completion Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{job.completion_notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Job Notes" description="Dated notes — type one here, or tell Jarvis" />
        <CardBody>
          <JobNotes jobId={id} notes={jobNotes.data} needsMigration={jobNotes.needsMigration} error={jobNotes.error} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Before / After Photos" description={job.sectionErrors.photos ? undefined : `${job.photos.length} on file`} />
        <CardBody className="space-y-4">
          <PhotoUploadForm jobId={id} />
          {job.sectionErrors.photos ? (
            <ErrorState title="Couldn't load photos" description={job.sectionErrors.photos} />
          ) : (
            <PhotoGrid photos={job.photos} photoUrls={photoUrls} photoUrlsError={photoUrlsError} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="History" description="What happened to this job, and when" />
        <CardBody>
          <ActivityTimeline events={activity ?? []} />
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Job" closeHref={`/jobs/${id}`} wide>
          <JobForm action={updateJobAction} job={job} properties={properties} services={services} routes={routes} employees={employees} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 break-words text-right text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
