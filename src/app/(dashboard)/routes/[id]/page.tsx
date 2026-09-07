import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, NotConfiguredState } from "@/components/ui/states";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatHours } from "@/lib/format";
import { getRouteById, routeEstimatedRevenue, routeEstimatedHours, routeProductionPerHour } from "@/lib/data/routes";
import { RouteStopList } from "@/components/routes/route-stop-list";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: route, error } = await getRouteById(id);

  if (error?.includes("not configured")) return <NotConfiguredState />;
  if (error) return <ErrorState description={error} />;
  if (!route) return null;

  const revenue = routeEstimatedRevenue(route);
  const hours = routeEstimatedHours(route);
  const perHour = routeProductionPerHour(route);

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={<span className="capitalize">{route.day_of_week}</span>}
        action={<Badge tone={route.is_active ? "accent" : "neutral"}>{route.is_active ? "Active" : "Inactive"}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Stops" value={route.stops.length} />
        <StatTile label="Estimated Revenue" value={formatCurrency(revenue)} tone="accent" />
        <StatTile label="Budgeted Hours" value={formatHours(hours)} />
        <StatTile label="Production $ / Hour" value={perHour !== null ? formatCurrency(perHour, true) : "—"} />
      </div>

      <Card>
        <CardHeader title="Stop Order" description="Drag priority via up/down — order saves automatically" />
        <CardBody>
          <RouteStopList routeId={route.id} stops={route.stops} />
        </CardBody>
      </Card>
    </div>
  );
}
