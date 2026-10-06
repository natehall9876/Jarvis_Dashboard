import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Route, RouteWithStops, ServiceAgreement } from "@/types/domain";

const STOPS_SELECT = `
  *,
  property:properties(*, client:clients(id, first_name, last_name, company_name, data_source))
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
  let query = supabase.from("routes").select("*").eq("active", true).order("route_day");
  if (routeQuery) query = supabase.from("routes").select("*").eq(routeQuery.column, routeQuery.value);

  const { data: routes, error } = await query;
  if (error) throw error;
  if (!routes || routes.length === 0) return [];

  const routeIds = routes.map((r) => r.id);

  const [{ data: stops, error: stopsError }, { data: agreements, error: agreementsError }] = await Promise.all([
    supabase.from("route_stops").select(STOPS_SELECT).in("route_id", routeIds),
    supabase.from("service_agreements").select("*").in("route_id", routeIds).eq("active", true),
  ]);

  if (stopsError) throw stopsError;
  if (agreementsError) throw agreementsError;
  const stopsByRoute = new Map<string, typeof stops>();
  for (const stop of stops ?? []) {
    const list = stopsByRoute.get(stop.route_id) ?? [];
    list.push(stop);
    stopsByRoute.set(stop.route_id, list);
  }

  return routes.map((route) => {
    const rawStops = ((stopsByRoute.get(route.id) ?? []) as unknown as RouteWithStops["stops"]).filter(s => s.property?.client?.data_source !== "demo");
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

export async function getRouteById(id: string): Promise<DataResult<RouteWithStops | null>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const [route] = await loadRouteWithStops(supabase, { column: "id", value: id });
    // A missing route (stale link, deleted route) is an ordinary "not
    // found," not a server error — matches every other detail page's
    // getXById, which return null rather than throwing for this case.
    return route ?? null;
  });
}

/** Persists a new stop order for a route — the drag-and-drop save path. */
export async function updateRouteStopOrder(
  routeId: string,
  updates: { id: string; stop_order: number }[],
): Promise<DataResult<true>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
      .rpc("save_route_stop_order", {p_route_id: routeId, p_stops: updates});
    if (error) throw error;
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
