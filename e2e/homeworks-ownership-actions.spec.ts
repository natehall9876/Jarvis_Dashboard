import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

type Row = Record<string, unknown>;
class ActionRedirect extends Error { constructor(readonly location: string) { super(location); } }

function form(values: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value);
  return data;
}

async function redirected(promise: Promise<unknown>): Promise<URL> {
  try { await promise; } catch (error) {
    if (error instanceof ActionRedirect) return new URL(error.location, "http://localhost");
    throw error;
  }
  throw new Error("Expected the action to redirect.");
}

function fixture(options: { failedRead?: string } = {}) {
  const rows: Record<string, Row[]> = {
    clients: [
      { id: "c-local", first_name: "Local", status: "active", notes: "Keep", homeworks_id: null },
      { id: "c-source", first_name: "Source", status: "active", notes: "Keep", homeworks_id: "10" },
    ],
    properties: [
      { id: "p-local", client_id: "c-local", street: "Local Street", active: true },
      { id: "p-source", client_id: "c-local", street: "Source Street", homeworks_id: "20", active: true },
      { id: "p-inherited", client_id: "c-source", street: "Inherited Street", active: true },
    ],
    jobs: [
      { id: "j-local", property_id: "p-local", price: 65, status: "scheduled", scheduled_date: "2026-10-07" },
      { id: "j-source", property_id: "p-source", homeworks_id: "42", price: 65, status: "scheduled", scheduled_date: "2026-10-07" },
      { id: "j-inherited", property_id: "p-inherited", price: 65, status: "scheduled", scheduled_date: "2026-10-07" },
    ],
    invoices: [], quotes: [], payments: [], job_employees: [],
    employees: [
      { id: "e-local", first_name: "Local", active: true, hourly_rate: 20, notes: "Keep" },
      { id: "e-source", first_name: "Source", active: true, hourly_rate: 20, notes: "Keep", homeworks_id: "30", has_drivers_license: true },
    ],
    invoice_items: [{ id: "ii-local", invoice_id: "i-local", total: 100 }, { id: "ii-source", invoice_id: "i-source", total: 100 }],
    quote_items: [{ id: "qi-local", quote_id: "q-local", total: 100, quantity: 1, unit_price: 100, description: "Mowing", is_optional: false }, { id: "qi-source", quote_id: "q-source", total: 100 }],
  };
  for (const [table, prefix] of [["invoices", "i"], ["quotes", "q"]]) {
    for (const [suffix, extra] of [
      ["local", {}], ["source", { homeworks_id: "50" }],
      ["inherited", { client_id: "c-source", property_id: "p-inherited" }],
      ["property", { property_id: "p-source" }],
    ] as const) rows[table].push({ id: `${prefix}-${suffix}`, client_id: "c-local", property_id: "p-local", status: "draft", amount_paid: 0, total: 100, ...extra });
  }
  const writes: { table: string; method: string; body: unknown; url: URL }[] = [];
  const sourceWrites: { id: string; patch: Row }[] = [];
  const db = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      const method = init?.method ?? "GET";
      if (method === "GET" && options.failedRead === table) return Response.json({ message: "Ownership lookup unavailable" }, { status: 500 });
      if (!rows[table]) throw new Error(`Unexpected table: ${table}`);
      const matches = (row: Row) => Array.from(url.searchParams).every(([key, value]) => !value.startsWith("eq.") || String(row[key]) === value.slice(3));
      let selected = rows[table].filter(matches);
      if (method !== "GET") {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        writes.push({ table, method, body, url });
        if (method === "POST") {
          selected = (Array.isArray(body) ? body : [body]).map((row: Row, index: number) => ({ id: `${table}-new-${rows[table].length + index}`, ...row }));
          rows[table].push(...selected);
        } else if (method === "PATCH") selected.forEach(row => Object.assign(row, body));
        else if (method === "DELETE") rows[table] = rows[table].filter(row => !matches(row));
        else throw new Error(`Unexpected method: ${method}`);
      }
      if (url.searchParams.get("select")?.includes("items:quote_items")) selected = selected.map(row => ({ ...row, items: rows.quote_items.filter(item => item.quote_id === row.id) }));
      const single = new Headers(init?.headers).get("accept")?.includes("application/vnd.pgrst.object+json");
      return Response.json(single ? selected[0] ?? null : selected);
    } },
  });
  const mocks = {
    "next/navigation": { redirect: (location: string) => { throw new ActionRedirect(location); } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => db },
    "@/lib/data/jobs": {},
    "@/lib/data/activity-log": { logActivity: async () => {} },
    "@/lib/integrations/homeworks-schedule-write": { writeHomeworksSchedule: async (id: string, patch: Row) => { sourceWrites.push({ id, patch }); } },
  };
  return {
    rows, writes, sourceWrites, db,
    clients: loadServerModule<typeof import("../src/lib/actions/clients")>("src/lib/actions/clients.ts", mocks),
    properties: loadServerModule<typeof import("../src/lib/actions/properties")>("src/lib/actions/properties.ts", mocks),
    jobs: loadServerModule<typeof import("../src/lib/actions/jobs")>("src/lib/actions/jobs.ts", mocks),
    invoices: loadServerModule<typeof import("../src/lib/actions/invoices")>("src/lib/actions/invoices.ts", mocks),
    quotes: loadServerModule<typeof import("../src/lib/actions/quotes")>("src/lib/actions/quotes.ts", mocks),
    employees: loadServerModule<typeof import("../src/lib/actions/employees")>("src/lib/actions/employees.ts", mocks),
  };
}

for (const marker of [{ homeworks_id: "10" }, { homeworks_status: "ACTIVE" }, { homeworks_deleted: true }, { data_source: "homeworks_sync" }]) {
  test(`client source marker blocks contact edits and archive: ${JSON.stringify(marker)}`, async () => {
    const f = fixture();
    Object.assign(f.rows.clients[0], marker);
    expect((await redirected(f.clients.updateClient("c-local", form({ first_name: "Changed", notes: "Must not partially save" })))).searchParams.get("error")).toContain("Homeworks");
    expect((await redirected(f.clients.archiveClient("c-local"))).searchParams.get("error")).toContain("Homeworks");
    expect(f.writes).toEqual([]);
  });
}

test("source client notes and inherited property notes remain native partial edits", async () => {
  const f = fixture();
  expect((await redirected(f.clients.updateClient("c-source", form({ notes: "Owner note" })))).search).toBe("");
  expect((await redirected(f.properties.updateProperty("p-inherited", form({ access_notes: "Side gate", service_notes: "Avoid seedlings" })))).search).toBe("");
  expect(f.writes.map(write => write.body)).toEqual([{ notes: "Owner note" }, { access_notes: "Side gate", service_notes: "Avoid seedlings" }]);
});

test("properties cannot be created or reparented under Homeworks clients or edit inherited addresses", async () => {
  const f = fixture();
  for (const action of [
    () => f.properties.createProperty(form({ client_id: "c-source", street: "New Street" })),
    () => f.properties.updateProperty("p-local", form({ client_id: "c-source" })),
    () => f.properties.updateProperty("p-inherited", form({ street: "Changed", access_notes: "No partial save" })),
    () => f.properties.archiveProperty("p-inherited"),
  ]) expect((await redirected(action())).searchParams.get("error")).toContain("Homeworks");
  expect(f.writes).toEqual([]);
});

test("source employee staffing details persist while contacts and archive remain source-owned", async () => {
  const f = fixture();
  expect((await redirected(f.employees.updateEmployee("e-source", form({ notes: "Owner note", hourly_rate: "25", role: "crew_lead", has_drivers_license: "false", hire_date: "2026-10-01" })))).search).toBe("");
  expect(f.writes[0].body).toEqual({ notes: "Owner note", hourly_rate: 25, role: "crew_lead", has_drivers_license: false, hire_date: "2026-10-01" });
  f.writes.length = 0;
  expect((await redirected(f.employees.updateEmployee("e-source", form({ phone: "5550001234", notes: "No partial save" })))).searchParams.get("error")).toContain("Homeworks");
  expect((await redirected(f.employees.archiveEmployee("e-source"))).searchParams.get("error")).toContain("Homeworks");
  expect(f.writes).toEqual([]);
});

test("source job markers and inherited property ownership block creation and crew changes", async () => {
  const f = fixture();
  for (const property_id of ["p-source", "p-inherited"]) await expect(f.jobs.insertJob({ property_id, price: 10 }, [])).rejects.toThrow(/Homeworks/);
  await expect(f.jobs.insertJob({ property_id: "p-local", homeworks_id: "forged" }, [])).rejects.toThrow(/Homeworks/);
  for (const id of ["j-source", "j-inherited"]) await expect(f.jobs.syncJobCrew(f.db as never, id, [])).rejects.toThrow(/Homeworks/);
  await expect(f.jobs.updateJobFields("j-local", { property_id: "p-source", notes: "No partial save" })).rejects.toThrow(/Homeworks/);
  expect(f.writes).toEqual([]);
});

test("inherited jobs without a source visit allow only native notes and hours", async () => {
  const f = fixture();
  await expect(f.jobs.updateJobFields("j-inherited", { scheduled_date: "2026-10-08", notes: "No partial save" })).rejects.toThrow(/Homeworks/);
  await expect(f.jobs.updateJobStatus("j-inherited", "completed")).rejects.toThrow(/Homeworks/);
  expect(f.writes).toEqual([]);
  await f.jobs.updateJobFields("j-inherited", { notes: "Owner note", completion_notes: "Finished edge", actual_hours: 1.5 });
  expect(f.writes.map(write => write.body)).toEqual([{ notes: "Owner note", completion_notes: "Finished edge", actual_hours: 1.5 }]);
  expect(f.sourceWrites).toEqual([]);
});

test("source job partial form leaves price and crew intact and still permits native notes", async () => {
  const f = fixture();
  expect((await redirected(f.jobs.updateJob("j-source", form({ notes: "Owner note" })))).search).toBe("");
  expect(f.writes.map(write => write.body)).toEqual([{ notes: "Owner note" }]);
});

test("unchanged empty source price submitted by the job form does not block native notes", async () => {
  const f = fixture();
  f.rows.jobs[1].price = null;
  expect((await redirected(f.jobs.updateJob("j-source", form({ price: "", notes: "Owner note" })))).search).toBe("");
  expect(f.writes.map(write => write.body)).toEqual([{ notes: "Owner note" }]);
});

test("native jobs may be created with source employees; missing employees cannot cause a partial job or crew write", async () => {
  const f = fixture();
  await expect(f.jobs.insertJob({ property_id: "p-local", price: 65 }, ["missing"])).rejects.toThrow(/not found/);
  await expect(f.jobs.syncJobCrew(f.db as never, "j-local", ["missing"])).rejects.toThrow(/not found/);
  expect(f.writes).toEqual([]);
  const id = await f.jobs.insertJob({ property_id: "p-local", price: 65 }, ["e-source"]);
  expect(f.rows.job_employees).toContainEqual(expect.objectContaining({ job_id: id, employee_id: "e-source" }));
});

for (const suffix of ["source", "inherited", "property"]) {
  test(`invoice financial actions reject ${suffix} ownership before any payment, line, or invoice write`, async () => {
    const f = fixture();
    const id = `i-${suffix}`;
    for (const action of [
      () => f.invoices.updateInvoice(id, form({ due_date: "2026-11-01", notes: "No partial save" })),
      () => f.invoices.updateInvoice(id, form({ total: "999", notes: "No partial save" })),
      () => f.invoices.deleteDraftInvoice(id), () => f.invoices.voidInvoice(id), () => f.invoices.sendInvoice(id),
      () => f.invoices.addInvoiceItem(id, form({ quantity: "1", unit_price: "50", description: "Change" })),
      () => f.invoices.removeInvoiceItem(id, "ii-source"),
      () => f.invoices.recordPayment(id, "c-local", form({ amount: "50" })),
    ]) expect((await redirected(action())).searchParams.get("error")).toContain("Homeworks");
    expect(f.writes).toEqual([]);
  });

  test(`quote financial actions and both conversions reject ${suffix} ownership before writing`, async () => {
    const f = fixture();
    const id = `q-${suffix}`;
    for (const action of [
      () => f.quotes.updateQuote(id, form({ valid_until: "2026-11-01", notes: "No partial save" })),
      () => f.quotes.updateQuote(id, form({ status: "accepted", notes: "No partial save" })),
      () => f.quotes.deleteDraftQuote(id),
      () => f.quotes.sendQuote(id), () => f.quotes.acceptQuote(id), () => f.quotes.declineQuote(id),
      () => f.quotes.addQuoteItem(id, form({ quantity: "1", unit_price: "50", description: "Change" })),
      () => f.quotes.removeQuoteItem(id, "qi-source"),
      () => f.quotes.convertQuoteToInvoice(id), () => f.quotes.convertQuoteToJob(id),
    ]) expect((await redirected(action())).searchParams.get("error")).toContain("Homeworks");
    expect(f.writes).toEqual([]);
  });

  test(`invoice and quote notes remain editable for ${suffix} ownership without clearing source fields`, async () => {
    const f = fixture();
    const invoice = f.rows.invoices.find(row => row.id === `i-${suffix}`)!;
    const quote = f.rows.quotes.find(row => row.id === `q-${suffix}`)!;
    invoice.due_date = "2026-10-31";
    quote.valid_until = "2026-10-31";
    const beforeInvoice = { ...invoice };
    const beforeQuote = { ...quote };
    expect((await redirected(f.invoices.updateInvoice(`i-${suffix}`, form({ notes: "Invoice owner note" })))).search).toBe("");
    expect((await redirected(f.quotes.updateQuote(`q-${suffix}`, form({ notes: "Quote owner note" })))).search).toBe("");
    expect(f.writes.map(write => ({ table: write.table, body: write.body }))).toEqual([
      { table: "invoices", body: { notes: "Invoice owner note" } },
      { table: "quotes", body: { notes: "Quote owner note" } },
    ]);
    expect(invoice).toEqual({ ...beforeInvoice, notes: "Invoice owner note" });
    expect(quote).toEqual({ ...beforeQuote, notes: "Quote owner note" });
  });
}

test("native invoice and quote edit forms still update property, date and notes together", async () => {
  const f = fixture();
  expect((await redirected(f.invoices.updateInvoice("i-local", form({ property_id: "p-local", due_date: "2026-11-01", notes: "Invoice note" })))).search).toBe("");
  expect((await redirected(f.quotes.updateQuote("q-local", form({ property_id: "p-local", valid_until: "2026-11-02", notes: "Quote note" })))).search).toBe("");
  expect(f.writes.map(write => write.body)).toEqual([
    { property_id: "p-local", due_date: "2026-11-01", notes: "Invoice note" },
    { property_id: "p-local", valid_until: "2026-11-02", notes: "Quote note" },
  ]);
});

test("new financial records and reparenting cannot attach to a Homeworks client or property", async () => {
  const f = fixture();
  for (const values of [{ client_id: "c-source" }, { client_id: "c-local", property_id: "p-source" }, { client_id: "c-local", property_id: "p-inherited" }]) {
    expect((await redirected(f.invoices.createInvoice(form(values)))).searchParams.get("error")).toContain("Homeworks");
    expect((await redirected(f.quotes.createQuote(form(values)))).searchParams.get("error")).toContain("Homeworks");
  }
  expect((await redirected(f.invoices.updateInvoice("i-local", form({ property_id: "p-source" })))).searchParams.get("error")).toContain("Homeworks");
  expect((await redirected(f.quotes.updateQuote("q-local", form({ property_id: "p-inherited" })))).searchParams.get("error")).toContain("Homeworks");
  expect(f.writes).toEqual([]);
});

test("line removal cannot use a local parent ID to delete another record's item", async () => {
  const f = fixture();
  expect((await redirected(f.invoices.removeInvoiceItem("i-local", "ii-source"))).searchParams.get("error")).toContain("does not belong");
  expect((await redirected(f.quotes.removeQuoteItem("q-local", "qi-source"))).searchParams.get("error")).toContain("does not belong");
  expect(f.writes).toEqual([]);
  expect((await redirected(f.invoices.removeInvoiceItem("i-local", "ii-local"))).search).toBe("");
  expect((await redirected(f.quotes.removeQuoteItem("q-local", "qi-local"))).search).toBe("");
  const deletes = f.writes.filter(write => write.method === "DELETE");
  expect(deletes.map(write => Object.fromEntries(write.url.searchParams))).toEqual([
    { id: "eq.ii-local", invoice_id: "eq.i-local" }, { id: "eq.qi-local", quote_id: "eq.q-local" },
  ]);
  expect(f.rows.invoice_items).toHaveLength(1);
  expect(f.rows.quote_items).toHaveLength(1);
});

test("payments verify the invoice client before insertion and native payments still update their invoice", async () => {
  const f = fixture();
  expect((await redirected(f.invoices.recordPayment("i-local", "c-source", form({ amount: "50" })))).searchParams.get("error")).toContain("does not match");
  expect(f.writes).toEqual([]);
  expect((await redirected(f.invoices.recordPayment("i-local", "c-local", form({ amount: "100" })))).search).toBe("");
  expect(f.rows.payments[0]).toMatchObject({ invoice_id: "i-local", client_id: "c-local", amount: 100 });
  expect(f.rows.invoices[0]).toMatchObject({ amount_paid: 100, status: "paid" });
});

test("native accepted quotes still convert to native invoices and jobs", async () => {
  const f = fixture();
  f.rows.quotes[0].status = "accepted";
  expect((await redirected(f.quotes.convertQuoteToInvoice("q-local"))).pathname).toContain("/invoices/invoices-new");
  expect((await redirected(f.quotes.convertQuoteToJob("q-local"))).pathname).toContain("/jobs/jobs-new");
  expect(f.rows.invoices.at(-1)).toMatchObject({ client_id: "c-local", property_id: "p-local", total: 100 });
  expect(f.rows.jobs.at(-1)).toMatchObject({ property_id: "p-local", price: 100 });
});

for (const failedRead of ["clients", "properties", "invoices"]) {
  test(`ownership read failure in ${failedRead} fails closed before payment writes`, async () => {
    const f = fixture({ failedRead });
    expect((await redirected(f.invoices.recordPayment("i-local", "c-local", form({ amount: "50" })))).searchParams.get("error")).toContain("unavailable");
    expect(f.writes).toEqual([]);
  });
}
