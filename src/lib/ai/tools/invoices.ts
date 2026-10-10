import { getInvoices, getInvoiceById, getOverdueInvoices } from "@/lib/data/invoices";
import { clientDisplayName } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";
import type { InvoiceDisplayStatus } from "@/types/domain";

const DISPLAY_STATUSES: InvoiceDisplayStatus[] = ["draft", "sent", "partial", "paid", "overdue", "void"];

export const invoiceTools: ToolSpec[] = [
  {
    name: "get_collections_review",
    description: "Compute a collections review from current recorded invoices: aggregate overdue balances by customer, rank the three largest accounts, and separately identify the oldest account. Use this for collections reviews. Preserve its ranking and totals; balances are Homeworks/Jarvis records, not reconciled QuickBooks cash.",
    input_schema: { type: "object", properties: {} },
    execute: async () => unwrap(await getInvoices(), invoices => {
      const eligible = invoices.filter(i => i.status !== "draft" && i.status !== "void" && !i.homeworks_deleted && i.client?.data_source !== "demo");
      if (eligible.some(i => !Number.isFinite(i.balance) || !Number.isFinite(i.days_overdue))) return { data: { error: "Collections review is unavailable because some invoice amounts or ages could not be verified." } };
      const overdue = eligible.filter(i => i.balance > 0 && i.days_overdue > 0);
      type Account = { client: string; balance: number; days_overdue: number; invoices: { id: string; invoice_number: string | null; balance: number; days_overdue: number }[] };
      const accounts = new Map<string, Account>();
      for (const invoice of overdue) {
        const key = invoice.client?.id ?? `unknown-invoice:${invoice.id}`;
        const account = accounts.get(key) ?? { client: clientDisplayName(invoice.client), balance: 0, days_overdue: 0, invoices: [] };
        account.balance = Math.round((account.balance + invoice.balance) * 100) / 100;
        account.days_overdue = Math.max(account.days_overdue, invoice.days_overdue);
        account.invoices.push({ id: invoice.id, invoice_number: invoice.invoice_number, balance: invoice.balance, days_overdue: invoice.days_overdue });
        accounts.set(key, account);
      }
      const ranked = [...accounts.values()].sort((a, b) => b.balance - a.balance || b.days_overdue - a.days_overdue || a.client.localeCompare(b.client));
      const top = ranked.slice(0, 3);
      const oldest = [...ranked].sort((a, b) => b.days_overdue - a.days_overdue || b.balance - a.balance)[0] ?? null;
      return {
        data: {
          source: "Homeworks/Jarvis recorded invoice balances; not QuickBooks-verified cash or profit",
          priority_basis: "Overdue account balance descending, then oldest overdue age. Keep this order; report the oldest account separately if it is outside the top three.",
          total_overdue_balance: Math.round(ranked.reduce((sum, account) => sum + account.balance, 0) * 100) / 100,
          overdue_invoice_count: overdue.length, overdue_account_count: ranked.length,
          top_accounts: top, oldest_account: oldest,
          limitations: "Based on available recorded invoices. Does not verify unrecorded payments, prior outreach or bank reconciliation. No records changed and no messages sent.",
        },
        references: [...new Map([...top, ...(oldest ? [oldest] : [])].flatMap(a => a.invoices.map(i => [i.id, { type: "invoice" as const, id: i.id, label: `${a.client} — ${i.invoice_number ? `#${i.invoice_number}` : "invoice"}` }] as const))).values()].slice(0, 12),
      };
    }),
  },
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
      return unwrap(result, (invoice) => {
        if (!invoice) return { data: { error: "That invoice doesn't exist — it may have been deleted, or the id may be wrong." } };
        return {
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
        };
      });
    },
  },
];
