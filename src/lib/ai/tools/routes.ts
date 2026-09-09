import { getRoutes, getRouteById, routeEstimatedRevenue, routeEstimatedHours, routeProductionPerHour } from "@/lib/data/routes";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const routeTools: ToolSpec[] = [
  {
    name: "get_routes",
    description:
      "List all recurring service routes with their stop count, estimated revenue per run, estimated budgeted hours, and estimated production rate ($/hour) — use to compare route efficiency or find which route runs a given day.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getRoutes();
      return unwrap(result, (routes) => ({
        data: routes.map((r) => ({
          id: r.id,
          name: r.name,
          day: r.route_day,
          active: r.active,
          stop_count: r.stops.length,
          estimated_revenue_per_run: routeEstimatedRevenue(r),
          estimated_budgeted_hours: routeEstimatedHours(r),
          estimated_production_per_hour: routeProductionPerHour(r),
        })),
        references: routes.map((r) => ({ type: "route" as const, id: r.id, label: r.name })),
      }));
    },
  },
  {
    name: "get_route_details",
    description: "Full stop-by-stop detail for one route: each property, its client, estimated price, and estimated hours, in visit order.",
    input_schema: {
      type: "object",
      properties: { route_id: { type: "string", description: "The route's UUID." } },
      required: ["route_id"],
    },
    execute: async (input) => {
      const result = await getRouteById(String(input.route_id));
      return unwrap(result, (route) => ({
        data: {
          id: route.id,
          name: route.name,
          day: route.route_day,
          active: route.active,
          estimated_revenue_per_run: routeEstimatedRevenue(route),
          estimated_budgeted_hours: routeEstimatedHours(route),
          stops: route.stops.map((s) => ({
            order: s.stop_order,
            property: propertyAddress(s.property),
            client: clientDisplayName(s.property?.client),
            estimated_price: s.estimated_price,
            budgeted_hours: s.budgeted_hours,
          })),
        },
        references: [
          { type: "route" as const, id: route.id, label: route.name },
          ...route.stops.flatMap((s) => (s.property ? [{ type: "property" as const, id: s.property.id, label: propertyAddress(s.property) }] : [])),
        ],
      }));
    },
  },
];
