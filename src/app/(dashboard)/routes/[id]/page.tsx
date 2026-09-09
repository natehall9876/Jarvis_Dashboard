import Link from "next/link";
import { Pencil, Archive, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Modal } from "@/components/ui/modal";
import { RouteForm } from "@/components/routes/route-form";
import { AddStopForm } from "@/components/routes/add-stop-form";
import { ErrorState, NotConfiguredState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatHours } from "@/lib/format";
import { getRouteById, routeEstimatedRevenue, routeEstimatedHours, routeProductionPerHour } from "@/lib/data/routes";
import { getPropertyOptions } from "@/lib/data/options";
import { updateRoute, archiveRoute, addRouteStop } from "@/lib/actions/routes";
import { RouteStopList } from "@/components/routes/route-stop-list";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; addStop?: string; error?: string }>;
}) {
  const { id } = await params;
  const { edit: isEditing, addStop: isAddingStop, error: formError } = await searchParams;
  const [{ data: route, error }, propertiesResult] = await Promise.all([
    getRouteById(id),
    isAddingStop ? getPropertyOptions() : Promise.resolve({ data: [], error: null }),
  ]);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!route) return null;

  const revenue = routeEstimatedRevenue(route);
  const hours = routeEstimatedHours(route);
  const perHour = routeProductionPerHour(route);
  const updateRouteWithId = updateRoute.bind(null, id);
  const archiveRouteWithId = archiveRoute.bind(null, id);
  const addRouteStopWithId = addRouteStop.bind(null, id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={<span className="capitalize">{route.route_day ?? "Unscheduled"}</span>}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={route.active ? "accent" : "neutral"}>{route.active ? "Active" : "Inactive"}</Badge>
            <Link href={`/routes/${id}?edit=1`}>
              <Button variant="secondary">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
            {route.active ? (
              <form action={archiveRouteWithId}>
                <ConfirmSubmit confirmMessage={`Archive ${route.name}? Its stops and history stay intact.`}>
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </ConfirmSubmit>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Stops" value={route.stops.length} />
        <StatTile label="Estimated Revenue" value={formatCurrency(revenue)} tone="accent" />
        <StatTile label="Budgeted Hours" value={formatHours(hours)} />
        <StatTile label="Production $ / Hour" value={perHour !== null ? formatCurrency(perHour, true) : "—"} />
      </div>

      <Card>
        <CardHeader
          title="Stop Order"
          description="Use the arrows to reorder — saves automatically"
          action={
            <Link href={`/routes/${id}?addStop=1`} className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
              <Plus className="h-3.5 w-3.5" />
              Add Stop
            </Link>
          }
        />
        <CardBody>
          <RouteStopList routeId={route.id} stops={route.stops} />
        </CardBody>
      </Card>

      {isEditing ? (
        <Modal title="Edit Route" closeHref={`/routes/${id}`}>
          <RouteForm action={updateRouteWithId} route={route} error={formError} />
        </Modal>
      ) : null}

      {isAddingStop ? (
        <Modal title="Add Stop" closeHref={`/routes/${id}`}>
          <AddStopForm action={addRouteStopWithId} properties={propertiesResult.data ?? []} error={formError} />
        </Modal>
      ) : null}
    </div>
  );
}
