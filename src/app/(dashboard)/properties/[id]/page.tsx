import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDate, clientDisplayName } from "@/lib/format";
import { getJobPhotoUrl } from "@/lib/supabase/storage";
import { getPropertyById } from "@/lib/data/properties";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await getPropertyById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!data) return null;

  const { property, client, route, agreements, jobs, quotes, invoices, photos } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={property.property_name || property.street || "Unnamed property"}
        description={[property.street, property.city, property.state, property.zip].filter(Boolean).join(", ")}
        action={<Badge tone={property.active ? "accent" : "neutral"}>{property.active ? "Active" : "Inactive"}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Client</div>
            {client ? (
              <Link href={`/clients/${client.id}`} className="mt-1 block text-sm text-[var(--color-accent)] hover:underline">
                {clientDisplayName(client)}
              </Link>
            ) : (
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">—</div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Route</div>
            {route ? (
              <Link href={`/routes/${route.id}`} className="mt-1 block text-sm text-[var(--color-accent)] hover:underline">
                {route.name}
              </Link>
            ) : (
              <div className="mt-1 text-sm text-[var(--color-text-secondary)]">Unassigned</div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Access Notes</div>
            <div className="mt-1 text-sm text-[var(--color-text-secondary)]">{property.access_notes ?? "—"}</div>
          </CardBody>
        </Card>
      </div>

      {property.service_notes ? (
        <Card>
          <CardHeader title="Service Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{property.service_notes}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Active Services" description={`${agreements.length} service agreement(s)`} />
        <CardBody>
          {agreements.length === 0 ? (
            <EmptyState title="No active service agreements" />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {agreements.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[var(--color-text-secondary)] capitalize">{(a.frequency ?? "").replace("_", " ")}</span>
                  <span className="font-medium text-[var(--color-text-primary)]">{formatCurrency(a.recurring_price)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Job History" />
          <CardBody>
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {jobs.slice(0, 8).map((j) => (
                  <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/jobs/${j.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      {formatDate(j.scheduled_date)}
                    </Link>
                    <StatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quotes" />
          <CardBody>
            {quotes.length === 0 ? (
              <EmptyState title="No quotes yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {quotes.slice(0, 8).map((q) => (
                  <li key={q.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/quotes/${q.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      {q.quote_number}
                    </Link>
                    <StatusBadge status={q.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Invoices" />
          <CardBody>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {invoices.slice(0, 8).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/invoices/${inv.id}`} className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                      #{inv.invoice_number}
                    </Link>
                    <StatusBadge status={inv.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Photos" description={`${photos.length} on file`} />
        <CardBody>
          {photos.length === 0 ? (
            <EmptyState title="No photos yet" description="Before/after photos from completed jobs will appear here." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((photo) => (
                <div key={photo.id} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getJobPhotoUrl(photo.storage_path)} alt={photo.caption ?? photo.photo_type ?? "Job photo"} className="h-28 w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
