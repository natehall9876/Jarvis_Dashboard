import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataStateGate } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatHours } from "@/lib/format";
import { getRoutes, routeEstimatedRevenue, routeEstimatedHours, routeProductionPerHour } from "@/lib/data/routes";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const { data: routes, error } = await getRoutes();

  return (
    <div className="space-y-6">
      <PageHeader title="Routes" description="Recurring service routes — stop order, revenue, and production hours." />

      <DataStateGate error={error} isEmpty={!!routes && routes.length === 0} emptyTitle="No routes yet">
        {routes ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {routes.map((route) => {
              const revenue = routeEstimatedRevenue(route);
              const hours = routeEstimatedHours(route);
              const perHour = routeProductionPerHour(route);
              return (
                <Card key={route.id}>
                  <CardHeader
                    title={route.name}
                    description={
                      <span className="capitalize">{route.day_of_week}</span>
                    }
                    action={<Badge tone={route.is_active ? "accent" : "neutral"}>{route.is_active ? "Active" : "Inactive"}</Badge>}
                  />
                  <CardBody>
                    <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-semibold text-[var(--color-text-primary)]">{route.stops.length}</div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Stops</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[var(--color-accent)]">{formatCurrency(revenue)}</div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">Revenue</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-[var(--color-text-primary)]">
                          {perHour !== null ? formatCurrency(perHour, true) : "—"}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">$ / Hour</div>
                      </div>
                    </div>
                    <div className="mb-3 text-xs text-[var(--color-text-muted)]">{formatHours(hours)} budgeted</div>
                    <Link href={`/routes/${route.id}`} className="text-sm text-[var(--color-accent)] hover:underline">
                      View & edit stop order →
                    </Link>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : null}
      </DataStateGate>
    </div>
  );
}
