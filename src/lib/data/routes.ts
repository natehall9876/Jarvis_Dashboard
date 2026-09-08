import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Route, RouteWithStops, ServiceAgreement } from "@/types/domain";

const STOPS_SELECT = `
  *,
  property:properties(*, client:clients(id, first_name, last_name, company_name))
`;

/**
 * route_stops has no price/hours of its own — a stop's economics come from
 * whichever active service_agreement covers that property on this route.
 */
function attachStopEconomics<T extends { property_id: string; estimated_minutes: number | null }>(
  stops: T[],
  agreements: ServiceAgreement[],
): (T & { estimated_price: number | null; budgeted_hours: number | null })[] {
  const agreementByProperty = new Map(agreements.map((a) => [a.property_id, a]));
  return stops.map((stop) => {
    const agreement = agreementByProperty.get(stop.property_id);
    const budgetedHoursFromMinutes = stop.estimated_minutes ? stop.estimated_minutes / 60 : null;
    return {
      ...stop,
      estimated_price: agreement?.recurring_price ?? null,
      budgeted_hours: agreement?.budgeted_hours ?? budgetedHoursFromMinutes,
    };
  });
}

async function loadRouteWithStops(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  routeQuery: { column: "id"; value: string } | null,
): Promise<RouteWithStops[]> {
  let query = supabase.from("routes").select("*").order("route_day");
  if (routeQuery) query = supabase.from("routes").select("*").eq(routeQuery.column, routeQuery.value);

  const { data: routes, error } = await query;
  if (error) throw error;
  if (!routes || routes.length === 0) return [];

  const routeIds = routes.map((r) => r.id);

  const [{ data: stops }, { data: agreements }] = await Promise.all([
    supabase.from("route_stops").select(STOPS_SELECT).in("route_id", routeIds),
    supabase.from("service_agreements").select("*").in("route_id", routeIds).eq("active", true),
  ]);

  const stopsByRoute = new Map<string, typeof stops>();
  for (const stop of stops ?? []) {
    const list = stopsByRoute.get(stop.route_id) ?? [];
    list.push(stop);
    stopsByRoute.set(stop.route_id, list);
  }

  return routes.map((route) => {
    const rawStops = (stopsByRoute.get(route.id) ?? []) as unknown as RouteWithStops["stops"];
    const withEconomics = attachStopEconomics(rawStops, agreements ?? []);
    return {
      ...route,
      stops: withEconomics.sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0)),
    };
  });
}

export async function getRoutes(): Promise<DataResult<RouteWithStops[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    return loadRouteWithStops(supabase, null);
  });
}

export async function getRouteById(id: string): Promise<DataResult<RouteWithStops>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const [route] = await loadRouteWithStops(supabase, { column: "id", value: id });
    if (!route) throw new Error("Route not found.");
    return route;
  });
}

/** Persists a new stop order for a route — the drag-and-drop save path. */
export async function updateRouteStopOrder(
  updates: { id: string; stop_order: number }[],
): Promise<DataResult<true>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    for (const update of updates) {
      const { error } = await supabase
        .from("route_stops")
        .update({ stop_order: update.stop_order })
        .eq("id", update.id);
      if (error) throw error;
    }
    return true as const;
  });
}

export function routeEstimatedRevenue(route: RouteWithStops): number {
  return route.stops.reduce((sum, stop) => sum + (stop.estimated_price ?? 0), 0);
}

export function routeEstimatedHours(route: RouteWithStops): number {
  return route.stops.reduce((sum, stop) => sum + (stop.budgeted_hours ?? 0), 0);
}

export function routeProductionPerHour(route: RouteWithStops): number | null {
  const hours = routeEstimatedHours(route);
  if (hours <= 0) return null;
  return routeEstimatedRevenue(route) / hours;
}

export type { Route };
