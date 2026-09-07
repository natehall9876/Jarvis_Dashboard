import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Route, RouteWithStops } from "@/types/domain";

const ROUTE_STOPS_SELECT = `
  *,
  stops:route_stops(
    *,
    property:properties(*, client:clients(id, name, company_name))
  )
`;

export async function getRoutes(): Promise<DataResult<RouteWithStops[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("routes")
      .select(ROUTE_STOPS_SELECT)
      .order("day_of_week");
    if (error) throw error;

    const routes = (data ?? []) as unknown as RouteWithStops[];
    return routes.map((route) => ({
      ...route,
      stops: [...route.stops].sort((a, b) => a.stop_order - b.stop_order),
    }));
  });
}

export async function getRouteById(id: string): Promise<DataResult<RouteWithStops>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("routes")
      .select(ROUTE_STOPS_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    const route = data as unknown as RouteWithStops;
    return {
      ...route,
      stops: [...route.stops].sort((a, b) => a.stop_order - b.stop_order),
    };
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
  const minutes = route.stops.reduce((sum, stop) => sum + (stop.budgeted_minutes ?? 0), 0);
  return minutes / 60;
}

export function routeProductionPerHour(route: RouteWithStops): number | null {
  const hours = routeEstimatedHours(route);
  if (hours <= 0) return null;
  return routeEstimatedRevenue(route) / hours;
}

export type { Route };
