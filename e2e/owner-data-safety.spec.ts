import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

type Row = Record<string, unknown>;
type Result = { data: Record<string, number> | null; error: string | null };
function fixture(rows: Record<string, Row[]> = {}, failTable?: string) {
  const requests: URL[] = [];
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    expect(init?.method ?? "GET").toBe("GET");
    const url = new URL(String(input)); requests.push(url);
    const table = url.pathname.split("/").at(-1)!;
    if (table === failTable) return Response.json({ message: "Test data unavailable" }, { status: 500 });
    let data = rows[table] ?? [];
    for (const [key, filter] of url.searchParams) {
      const [op, ...rest] = filter.split("."); const value = rest.join(".");
      if (op === "in") data = data.filter(row => value.slice(1, -1).split(",").includes(String(row[key])));
      if (op === "lt") data = data.filter(row => String(row[key]) < value);
      if (op === "gte") data = data.filter(row => String(row[key]) >= value);
      if (op === "lte") data = data.filter(row => String(row[key]) <= value);
      if (op === "eq") data = data.filter(row => String(row[key]) === value);
      if (op === "neq") data = data.filter(row => String(row[key]) !== value);
    }
    return Response.json(data);
  } } });
  const mocks = { "@/lib/env": { isSupabaseConfigured: () => true }, "@/lib/supabase/server": { createSupabaseServerClient: async () => client } };
  return { requests, mocks, pulse: loadServerModule<{ getBusinessPulse: (now?: Date) => Promise<Result> }>("src/lib/data/command-center.ts", mocks) };
}
const job = (id: string, date: string, price: number, status = "completed") => ({ id, scheduled_date: date, price, status, property_id: "real-property", actual_hours: 1 });

test("weekly revenue includes prior-month jobs while monthly revenue stays in its month", async () => {
  const f = fixture({ jobs: [job("sep", "2026-09-28", 100), job("oct", "2026-10-01", 200), job("future", "2026-10-05", 400)] });
  const result = await f.pulse.getBusinessPulse(new Date("2026-10-01T16:00:00Z"));
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ revenueToday: 200, revenueWeek: 300, revenueMonth: 200, jobsCompletedMonth: 1, averageTicketMonth: 200 });
});

test("month boundaries follow Rhode Island before UTC midnight rollover", async () => {
  const f = fixture({ jobs: [job("last-day", "2026-08-31", 150), job("next-day", "2026-09-01", 250)] });
  const result = await f.pulse.getBusinessPulse(new Date("2026-09-01T02:00:00Z"));
  expect(result.data).toMatchObject({ revenueToday: 150, revenueMonth: 150, scheduledRevenueMonth: 150 });
});

test("cash totals exclude future and confirmed demo payments", async () => {
  const f = fixture({ clients: [{ id: "demo", data_source: "demo" }], payments: [
    { amount: 100, payment_date: "2026-10-01", client_id: "real" },
    { amount: 500, payment_date: "2026-10-02", client_id: "real" },
    { amount: 900, payment_date: "2026-10-01", client_id: "demo" },
  ] });
  const result = await f.pulse.getBusinessPulse(new Date("2026-10-01T16:00:00Z"));
  expect(result.data?.cashCollectedMonth).toBe(100);
});

test("skipped jobs are not projected revenue", async () => {
  const f = fixture({ jobs: [job("active", "2026-10-01", 100), job("skipped", "2026-10-02", 900, "skipped")] });
  expect((await f.pulse.getBusinessPulse(new Date("2026-10-01T16:00:00Z"))).data?.scheduledRevenueMonth).toBe(100);
});

test("future time entries cannot inflate this month's paid hours", async () => {
  const f = fixture({ time_entries: [{ work_date: "2026-10-01", regular_hours: 2, employee_id: "worker" }, { work_date: "2026-10-02", regular_hours: 8, employee_id: "worker" }], employees: [{ id: "worker", hourly_rate: 20 }] });
  expect((await f.pulse.getBusinessPulse(new Date("2026-10-01T16:00:00Z"))).data).toMatchObject({ totalPaidHoursMonth: 2, laborCostMonth: 40 });
});

for (const table of ["clients", "properties", "payments", "employees", "time_entries", "invoices", "quotes"]) {
  test(table + " failure cannot produce a successful zero-dollar business pulse", async () => {
    const f = fixture({ clients: [{ id: "demo", data_source: "demo" }] }, table);
    const result = await f.pulse.getBusinessPulse();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
}

test("draft invoices never appear as overdue receivables", async () => {
  const f = fixture({ invoices: [
    { id: "draft", status: "draft", total: 500, amount_paid: 0, due_date: "2000-01-01", client: { data_source: "unverified" } },
    { id: "sent", status: "sent", total: 100, amount_paid: 0, due_date: "2000-01-01", client: { data_source: "unverified" } },
  ] });
  const invoices = loadServerModule<{ getOverdueInvoices: () => Promise<{ data: Row[] }> }>("src/lib/data/invoices.ts", f.mocks);
  expect((await invoices.getOverdueInvoices()).data.map(row => row.id)).toEqual(["sent"]);
});

test("mission rollups exclude skipped, cancelled and demo crew and routes", async () => {
  const rows = [
    { ...job("active", "2026-10-03", 100, "scheduled"), route_id: "real-route", property: { client: { data_source: "unverified" } } },
    { ...job("skipped", "2026-10-03", 500, "skipped"), route_id: "skip-route", property: { client: { data_source: "unverified" } } },
    { ...job("demo", "2026-10-03", 900, "scheduled"), route_id: "demo-route", property: { client: { data_source: "demo" } } },
  ];
  const f = fixture({ jobs: rows, job_employees: rows.map(row => ({ job_id: row.id, employee: { id: row.id, first_name: "Test", last_name: row.id } })) });
  const api = loadServerModule<{ getTodaysMission: () => Promise<{ data: { jobCount: number; expectedRevenue: number; crewWorking: { id: string }[]; routesRunning: string[] } }> }>("src/lib/data/command-center.ts", {
    ...f.mocks, "@/lib/integrations/homeworks-dates": { todayInZone: () => "2026-10-03" },
    "@/lib/data/notes-tasks": { getOpenTasks: async () => ({ data: [], error: null }) },
  });
  const { data } = await api.getTodaysMission();
  expect(data).toMatchObject({ jobCount: 1, expectedRevenue: 100, routesRunning: ["real-route"] });
  expect(data.crewWorking.map(row => row.id)).toEqual(["active"]);
});

test("mission retains its jobs but labels unread invoice history unavailable", async () => {
  const f = fixture({ jobs: [job("active", "2026-10-03", 100, "scheduled")] }, "invoices");
  const api = loadServerModule<{ getTodaysMission: () => Promise<{ data: { jobCount: number; unavailableSections: string[] } }> }>("src/lib/data/command-center.ts", {
    ...f.mocks, "@/lib/integrations/homeworks-dates": { todayInZone: () => "2026-10-03" },
    "@/lib/data/notes-tasks": { getOpenTasks: async () => ({ data: [], error: null }) },
  });
  const { data } = await api.getTodaysMission();
  expect(data.jobCount).toBe(1);
  expect(data.unavailableSections).toContain("invoices");
});

test("attention reports cannot claim no issues when a source failed", async () => {
  const f = fixture({}, "quotes");
  const api = loadServerModule<{ getAttentionItems: () => Promise<Result> }>("src/lib/data/attention.ts", {
    ...f.mocks, "@/lib/data/jobs": { getWorkloadSummary: async () => ({ data: { days: [] }, error: null }) },
  });
  expect((await api.getAttentionItems()).error).toBeTruthy();
});

test("attention excludes confirmed demo quotes and unfinished jobs", async () => {
  const f = fixture({
    quotes: [{ id: "demo-quote", status: "sent", sent_at: "2000-01-01", total: 900, client: { data_source: "demo" } }],
    jobs: [{ ...job("demo-job", "2000-01-01", 900, "scheduled"), property: { client: { data_source: "demo" } } }],
  });
  const api = loadServerModule<{ getAttentionItems: () => Promise<{ data: { items: unknown[] } }> }>("src/lib/data/attention.ts", {
    ...f.mocks, "@/lib/data/jobs": { getWorkloadSummary: async () => ({ data: { days: [] }, error: null }) },
  });
  expect((await api.getAttentionItems()).data.items).toEqual([]);
});
