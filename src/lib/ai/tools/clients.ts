import { getClients, getClientById } from "@/lib/data/clients";
import { clientDisplayName, propertyAddress, daysOverdue } from "@/lib/format";
import { invoiceBalance, invoiceDisplayStatus } from "@/lib/calculations";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const clientTools: ToolSpec[] = [
  {
    name: "search_clients",
    description:
      "Search or list clients (customers) by name, company, or email. Omit the query to list every client, sorted by name. Each result includes how many properties they have on file and their current outstanding balance, so this alone can answer 'who owes money' or 'how many clients do we have'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional search text matched against name, company, or email." },
      },
    },
    execute: async (input) => {
      const query = typeof input.query === "string" ? input.query : undefined;
      const result = await getClients(query);
      return unwrap(result, (clients) => ({
        data: clients.map((c) => ({
          id: c.id,
          name: clientDisplayName(c),
          status: c.status,
          phone: c.phone,
          email: c.email,
          properties_count: c.properties_count,
          outstanding_balance: c.outstanding_balance,
        })),
        references: clients.map((c) => ({ type: "client" as const, id: c.id, label: clientDisplayName(c) })),
      }));
    },
  },
  {
    name: "get_client_details",
    description:
      "Full detail for one client: contact info, notes, every property they own, their recent jobs, quotes, and invoices, their current outstanding balance, and total revenue from their completed jobs on file (their real customer value — not an estimate). Use after search_clients has found the client's id, or when a page-context id is already known.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "The client's UUID." },
      },
      required: ["client_id"],
    },
    execute: async (input) => {
      const result = await getClientById(String(input.client_id));
      return unwrap(result, (detail) => {
        const completedJobs = detail.jobs.filter((j) => j.status === "completed");
        return {
        data: {
          id: detail.client.id,
          name: clientDisplayName(detail.client),
          status: detail.client.status,
          phone: detail.client.phone,
          email: detail.client.email,
          preferred_contact_method: detail.client.preferred_contact_method,
          notes: detail.client.notes,
          outstanding_balance: detail.outstanding_balance,
          completed_job_count: completedJobs.length,
          revenue_from_completed_jobs: completedJobs.reduce((sum, j) => sum + (j.price ?? 0), 0),
          job_history_note: detail.jobs.length >= 50 ? "Based on the 50 most recent jobs on file, not necessarily full history." : "Based on full job history on file.",
          properties: detail.properties.map((p) => ({ id: p.id, address: propertyAddress(p), active: p.active })),
          recent_jobs: detail.jobs.slice(0, 10).map((j) => ({
            id: j.id,
            scheduled_date: j.scheduled_date,
            status: j.status,
            price: j.price,
            budgeted_hours: j.budgeted_hours,
            actual_hours: j.actual_hours,
          })),
          quotes: detail.quotes.map((q) => ({
            id: q.id,
            quote_number: q.quote_number,
            status: q.status,
            total: q.total,
            sent_at: q.sent_at,
          })),
          invoices: detail.invoices.map((i) => {
            const balance = invoiceBalance(i.total, i.amount_paid);
            const days_overdue = balance > 0 ? Math.max(0, daysOverdue(i.due_date)) : 0;
            return {
              id: i.id,
              invoice_number: i.invoice_number,
              status: invoiceDisplayStatus({ status: i.status, balance, days_overdue }),
              total: i.total,
              amount_paid: i.amount_paid,
              balance,
              due_date: i.due_date,
              days_overdue,
            };
          }),
        },
        references: [
          { type: "client" as const, id: detail.client.id, label: clientDisplayName(detail.client) },
          ...detail.properties.map((p) => ({ type: "property" as const, id: p.id, label: propertyAddress(p) })),
        ],
        };
      });
    },
  },
];
