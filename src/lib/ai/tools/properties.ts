import { getProperties, getPropertyById } from "@/lib/data/properties";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const propertyTools: ToolSpec[] = [
  {
    name: "search_properties",
    description: "Search or list serviced properties by address or name. Omit the query to list every property.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional search text matched against street, city, or property name." },
      },
    },
    execute: async (input) => {
      const query = typeof input.query === "string" ? input.query : undefined;
      const result = await getProperties(query);
      return unwrap(result, (properties) => ({
        data: properties.map((p) => ({
          id: p.id,
          address: propertyAddress(p),
          client: clientDisplayName(p.client),
          active: p.active,
        })),
        references: properties.map((p) => ({ type: "property" as const, id: p.id, label: propertyAddress(p) })),
      }));
    },
  },
  {
    name: "get_property_details",
    description:
      "Full detail for one property: owning client, assigned route, active service agreements (recurring price/frequency), job history, quotes, and invoices tied to it.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "The property's UUID." },
      },
      required: ["property_id"],
    },
    execute: async (input) => {
      const result = await getPropertyById(String(input.property_id));
      return unwrap(result, (detail) => ({
        data: {
          id: detail.property.id,
          address: propertyAddress(detail.property),
          access_notes: detail.property.access_notes,
          service_notes: detail.property.service_notes,
          active: detail.property.active,
          client: detail.client ? { id: detail.client.id, name: clientDisplayName(detail.client) } : null,
          route: detail.route ? { id: detail.route.id, name: detail.route.name } : null,
          active_service_agreements: detail.agreements
            .filter((a) => a.active)
            .map((a) => ({ frequency: a.frequency, recurring_price: a.recurring_price, budgeted_hours: a.budgeted_hours })),
          recent_jobs: detail.jobs.slice(0, 10).map((j) => ({ id: j.id, scheduled_date: j.scheduled_date, status: j.status, price: j.price })),
          quotes: detail.quotes.map((q) => ({ id: q.id, quote_number: q.quote_number, status: q.status })),
          invoices: detail.invoices.map((i) => ({ id: i.id, invoice_number: i.invoice_number, status: i.status, total: i.total })),
        },
        references: [
          { type: "property" as const, id: detail.property.id, label: propertyAddress(detail.property) },
          ...(detail.client ? [{ type: "client" as const, id: detail.client.id, label: clientDisplayName(detail.client) }] : []),
          ...(detail.route ? [{ type: "route" as const, id: detail.route.id, label: detail.route.name }] : []),
        ],
      }));
    },
  },
];
