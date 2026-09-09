import { getInvoices, getInvoiceById, getOverdueInvoices } from "@/lib/data/invoices";
import { clientDisplayName } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";
import type { InvoiceDisplayStatus } from "@/types/domain";

const DISPLAY_STATUSES: InvoiceDisplayStatus[] = ["draft", "sent", "partial", "paid", "overdue", "void"];

export const invoiceTools: ToolSpec[] = [
  {
    name: "get_invoices",
    description:
      "List invoices, optionally filtered by display status (draft/sent/partial/paid/overdue/void — 'overdue' and 'partial' are computed from balance and due date, not the raw stored status). Each result includes total, amount paid, remaining balance, and days overdue.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: DISPLAY_STATUSES, description: "Optional display-status filter." },
      },
    },
    execute: async (input) => {
      const result = await getInvoices();
      return unwrap(result, (invoices) => {
        const status = typeof input.status === "string" ? input.status : undefined;
        const filtered = status ? invoices.filter((i) => i.display_status === status) : invoices;
        return {
          data: filtered.map((i) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            client: clientDisplayName(i.client),
            status: i.display_status,
            invoice_date: i.invoice_date,
            due_date: i.due_date,
            total: i.total,
            amount_paid: i.amount_paid,
            balance: i.balance,
            days_overdue: i.days_overdue,
          })),
          references: filtered.map((i) => ({ type: "invoice" as const, id: i.id, label: `#${i.invoice_number}` })),
        };
      });
    },
  },
  {
    name: "get_overdue_invoices",
    description: "The most overdue unpaid invoices, worst first, with the client, balance owed, and days overdue for each. Use for 'who owes money' / receivables questions.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "string", description: "Optional max number of results (default 10)." },
      },
    },
    execute: async (input) => {
      const limit = typeof input.limit === "string" ? Number(input.limit) : typeof input.limit === "number" ? input.limit : 10;
      const result = await getOverdueInvoices(Number.isFinite(limit) && limit > 0 ? limit : 10);
      return unwrap(result, (invoices) => ({
        data: {
          count: invoices.length,
          total_overdue_balance: invoices.reduce((sum, i) => sum + i.balance, 0),
          invoices: invoices.map((i) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            client: clientDisplayName(i.client),
            balance: i.balance,
            due_date: i.due_date,
            days_overdue: i.days_overdue,
          })),
        },
        references: invoices.map((i) => ({ type: "invoice" as const, id: i.id, label: `#${i.invoice_number}` })),
      }));
    },
  },
  {
    name: "get_invoice_details",
    description: "Full detail for one invoice: line items, every payment recorded against it, balance, and overdue status.",
    input_schema: {
      type: "object",
      properties: { invoice_id: { type: "string", description: "The invoice's UUID." } },
      required: ["invoice_id"],
    },
    execute: async (input) => {
      const result = await getInvoiceById(String(input.invoice_id));
      return unwrap(result, (invoice) => ({
        data: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          client: clientDisplayName(invoice.client),
          status: invoice.display_status,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          total: invoice.total,
          amount_paid: invoice.amount_paid,
          balance: invoice.balance,
          days_overdue: invoice.days_overdue,
          notes: invoice.notes,
          items: invoice.items.map((it) => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, total: it.total })),
          payments: invoice.payments.map((p) => ({ amount: p.amount, payment_date: p.payment_date, method: p.payment_method })),
        },
        references: invoice.client
          ? [
              { type: "invoice" as const, id: invoice.id, label: `#${invoice.invoice_number}` },
              { type: "client" as const, id: invoice.client.id, label: clientDisplayName(invoice.client) },
            ]
          : [{ type: "invoice" as const, id: invoice.id, label: `#${invoice.invoice_number}` }],
      }));
    },
  },
];
