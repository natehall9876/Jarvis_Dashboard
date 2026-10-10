import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import type { ToolSpec } from "../src/lib/ai/tool-types";

function subject(rows: unknown[]) {
  const { invoiceTools } = loadServerModule<{ invoiceTools: ToolSpec[] }>("src/lib/ai/tools/invoices.ts", {
    "@/lib/data/invoices": { getInvoices: async () => ({ data: rows, error: null }) },
  });
  return invoiceTools.find(t => t.name === "get_collections_review");
}
const invoice = (id: string, clientId: string, balance: number, days: number, extra = {}) => ({
  id, invoice_number: id, status: "sent", balance, days_overdue: days,
  client: { id: clientId, first_name: clientId, last_name: "Example", data_source: "owner_verified" }, ...extra,
});

test("collections review aggregates accounts and ranks dollars before age without losing the oldest account", async () => {
  const tool = subject([invoice("a", "Oldest", 50, 76), invoice("b", "Largest", 450, 59), invoice("c", "Second", 390, 59), invoice("d", "Third", 130, 28), invoice("e", "Largest", 5, 4)]);
  expect(tool).toBeDefined();
  const result = await tool!.execute({});
  expect(result.data).toMatchObject({ total_overdue_balance: 1025, overdue_invoice_count: 5, overdue_account_count: 4,
    top_accounts: [{ client: "Largest Example", balance: 455 }, { client: "Second Example", balance: 390 }, { client: "Third Example", balance: 130 }],
    oldest_account: { client: "Oldest Example", balance: 50, days_overdue: 76 } });
});

test("collections review excludes drafts, voids, deleted, demo and non-overdue records", async () => {
  const tool = subject([invoice("a", "Real", 80, 3), invoice("b", "Draft", 100, 40, { status: "draft" }), invoice("c", "Void", 100, 40, { status: "void" }), invoice("d", "Deleted", 100, 40, { homeworks_deleted: true }), invoice("e", "Current", 100, 0), invoice("f", "Demo", 100, 40, { client: { id: "demo", first_name: "Demo", data_source: "demo" } })]);
  expect(tool).toBeDefined();
  expect((await tool!.execute({})).data).toMatchObject({ total_overdue_balance: 80, overdue_invoice_count: 1, overdue_account_count: 1 });
});
