import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

function fixture() {
  const writes: { table: string; body: Record<string, unknown> }[] = [];
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const table = new URL(String(input)).pathname.split("/").pop()!;
    if ((init?.method ?? "GET") === "GET") return Response.json([{ id: "parent-test" }]);
    writes.push({ table, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: "record-test" });
  } } });
  const sync = loadServerModule<typeof import("../src/lib/integrations/homeworks-sync")>("src/lib/integrations/homeworks-sync.ts", {
    "@/lib/data/activity-log": { logActivity: async () => {} },
    "@/lib/integrations/homeworks-sync-failures": { logSyncFailure: async () => {} },
    "@/lib/data/shared": { extractErrorMessage: () => "Test database error" },
  });
  return { sync, client, writes };
}

test("a partial job delivery does not erase schedule, price, status, or notes", async () => {
  const f = fixture();
  const result = await f.sync.syncHomeworksEntity(f.client, { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1" });
  expect(result.ok).toBe(true);
  const body = f.writes.find(w => w.table === "jobs")!.body;
  for (const key of ["scheduled_date", "scheduled_start_time", "price", "status", "notes"]) expect(body).not.toHaveProperty(key);
});

test("a partial invoice delivery does not erase balances, dates, or tax", async () => {
  const f = fixture();
  const result = await f.sync.syncHomeworksEntity(f.client, { entity_type: "invoice", homeworks_id: "inv-1", customer_homeworks_id: "customer-1" });
  expect(result.ok).toBe(true);
  const body = f.writes.find(w => w.table === "invoices")!.body;
  for (const key of ["invoice_number", "total", "subtotal", "tax", "amount_paid", "status", "due_date", "invoice_date"]) expect(body).not.toHaveProperty(key);
});

test("a property sync does not reactivate a property without an explicit source value", async () => {
  const f = fixture();
  await f.sync.syncHomeworksEntity(f.client, { entity_type: "property", homeworks_id: "property-1", customer_homeworks_id: "customer-1" });
  expect(f.writes.find(w => w.table === "properties")!.body).not.toHaveProperty("active");
});

for (const [name, payload] of [
  ["invalid date", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_date: "2026-02-30" }],
  ["invalid time", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_start_time: "29:90" }],
  ["negative price", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", price: -1 }],
  ["invalid status", { entity_type: "invoice", homeworks_id: "inv-1", customer_homeworks_id: "customer-1", status: "nonsense" }],
  ["invalid numeric value", { entity_type: "invoice", homeworks_id: "inv-1", customer_homeworks_id: "customer-1", amount_paid: "paid" }],
  ["invalid string", { entity_type: "customer", homeworks_id: "customer-1", phone: { nested: true } }],
] as const) {
  test("sync rejects " + name + " before touching the database", async () => {
    const f = fixture();
    expect(f.sync.isValidHomeworksSyncPayload(payload)).toBe(false);
    const result = await f.sync.syncHomeworksEntity(f.client, payload as never);
    expect(result.ok).toBe(false);
    expect(f.writes).toHaveLength(0);
  });
}

test("explicit all-day time clearing is distinct from an omitted time", async () => {
  const f = fixture();
  await f.sync.syncHomeworksEntity(f.client, { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_start_time: null } as never);
  expect(f.writes.find(w => w.table === "jobs")!.body).toHaveProperty("scheduled_start_time", null);
});

test("duplicate customers in one import batch cannot bypass phone matching", async () => {
  const writes: string[] = [];
  const customer = (id: string) => ({ id, fullName: "Test Person", firstName: "Test", lastName: "Person", phone: "4015550123", cell: "", email: "", properties: [] });
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json([]) } });
  const action = loadServerModule<typeof import("../src/lib/actions/homeworks-import")>("src/lib/actions/homeworks-import.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/integrations/homeworks-api": { getAllCustomers: async () => ({ ok: true, data: { customers: [customer("one"), customer("two")], hitCap: false } }) },
    "@/lib/integrations/homeworks-sync": { syncHomeworksEntity: async (_client: unknown, payload: { homeworks_id: string }) => { writes.push(payload.homeworks_id); return { ok: true, id: "test" }; } },
  });
  const result = await action.confirmHomeworksImport();
  expect(result).toMatchObject({ ok: true, created: 1, skippedDuplicates: 1 });
  expect(writes).toEqual(["one"]);
});

test("a failed property sync is counted as an import error", async () => {
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json([]) } });
  const action = loadServerModule<typeof import("../src/lib/actions/homeworks-import")>("src/lib/actions/homeworks-import.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/integrations/homeworks-api": { getAllCustomers: async () => ({ ok: true, data: { customers: [{ id: "one", fullName: "Test", properties: [{ id: "prop-1", name: "Test property" }] }], hitCap: false } }) },
    "@/lib/integrations/homeworks-sync": { syncHomeworksEntity: async (_client: unknown, payload: { entity_type: string }) => payload.entity_type === "property" ? { ok: false, error: "Test write failed" } : { ok: true, id: "test" } },
  });
  const result = await action.confirmHomeworksImport();
  expect(result).toMatchObject({ ok: true, propertiesSynced: 0, errors: 1 });
});

for (const time of ["9:30", "09:30", "23:59:59"]) {
  test("valid timed Homeworks jobs still sync: " + time, async () => {
    const f = fixture();
    const result = await f.sync.syncHomeworksEntity(f.client, { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_date: "2026-10-03", scheduled_start_time: time, price: 0, status: "scheduled" });
    expect(result.ok).toBe(true);
    expect(f.writes.find(w => w.table === "jobs")!.body).toMatchObject({ scheduled_date: "2026-10-03", scheduled_start_time: time, price: 0, status: "scheduled" });
  });
}

for (const overrides of [{ total: null }, { total: "" }, { total: "not-money" }, { hasTime: undefined }, { hasTime: "false" }]) {
  test("malformed source event cannot reset an existing job: " + JSON.stringify(overrides), async () => {
    let writes = 0;
    const source = { id: "event-1", title: "Test", status: "OPEN", startDate: "2026-10-03", hasTime: false, startTime: null, total: "100", property: { id: "property-1" }, ...overrides };
    const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json([{ id: "parent-test", homeworks_id: "property-1" }]) } });
    const action = loadServerModule<typeof import("../src/lib/actions/homeworks-job-sync")>("src/lib/actions/homeworks-job-sync.ts", {
      "next/cache": { revalidatePath: () => {} },
      "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
      "@/lib/integrations/homeworks-connection": { getValidAccessToken: async () => ({ ok: true, accessToken: "test" }) },
      "@/lib/integrations/homeworks-oauth": { HOMEWORKS_GRAPHQL_ENDPOINT: "https://homeworks.example/graphql" },
      "@/lib/integrations/homeworks-sync": { syncHomeworksEntity: async () => { writes++; return { ok: true }; } },
    }, async () => Response.json({ data: { events: [source] } }));
    expect((await action.confirmHomeworksJobImport({ from: "2026-10-03", to: "2026-10-03" })).ok).toBe(false);
    expect(writes).toBe(0);
  });
}
