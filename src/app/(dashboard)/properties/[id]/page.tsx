import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { PropertyForm } from "@/components/properties/property-form";
import { EmptyState, ErrorState, NotConfiguredState } from "@/components/ui/states";
import { formatCurrency, formatDateOnly, clientDisplayName } from "@/lib/format";
import { getJobPhotoUrls } from "@/lib/supabase/storage";
import { getPropertyById } from "@/lib/data/properties";
import { getClientOptions, getServiceOptions } from "@/lib/data/options";
import { updateProperty, archiveProperty } from "@/lib/actions/properties";
import { PhotoUploadForm } from "@/components/photos/photo-upload-form";
import { PhotoGrid } from "@/components/photos/photo-grid";
import { ServiceHistoryCard } from "@/components/jobs/service-history-card";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, error: formError } = await searchParams;
  const [{ data, error }, clientsResult, { data: services }] = await Promise.all([
    getPropertyById(id),
    isEditing ? getClientOptions() : Promise.resolve({ data: [], error: null }),
    getServiceOptions(),
  ]);
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name]));

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!data) notFound();

  const { property, client, route, agreements, jobs, quotes, invoices, photos } = data;
  const { urls: photoUrls, error: photoUrlsError } = await getJobPhotoUrls(photos.map((p) => p.storage_path));
  const updatePropertyWithId = updateProperty.bind(null, id);
  const archivePropertyWithId = archiveProperty.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={property.property_name || property.street || "Unnamed property"}
        description={[property.street, property.city, property.state, property.zip].filter(Boolean).join(", ")}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={property.active ? "accent" : "neutral"}>{property.active ? "Active" : "Inactive"}</Badge>
            <Link href={`/properties/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {property.active ? (
              <form action={archivePropertyWithId}>
                <ConfirmSubmit confirmMessage="Archive this property? Its history stays intact, but it'll be marked inactive.">
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Job History" />
          <CardBody>
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {jobs.slice(0, 8).map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>{formatDateOnly(j.scheduled_date)}</span>
                      <StatusBadge status={j.status} />
                    </Link>
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
                  <li key={q.id}>
                    <Link
                      href={`/quotes/${q.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>{q.quote_number}</span>
                      <StatusBadge status={q.status} />
                    </Link>
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
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <span>#{inv.invoice_number}</span>
                      <StatusBadge status={inv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <ServiceHistoryCard jobs={jobs} serviceNameById={serviceNameById} />

      <Card>
        <CardHeader title="Photos" description={`${photos.length} on file`} />
        <CardBody className="space-y-4">
          <PhotoUploadForm propertyId={id} clientId={client?.id} />
          <PhotoGrid photos={photos} photoUrls={photoUrls} photoUrlsError={photoUrlsError} emptyDescription="Before/after photos from completed jobs will appear here." />
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Property" closeHref={`/properties/${id}`}>
          <PropertyForm action={updatePropertyWithId} property={property} clients={clientsResult.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
