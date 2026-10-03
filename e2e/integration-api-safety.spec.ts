import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";

const adapters = [
  { provider: "Homeworks", file: "homeworks", invoke: "getAllCustomers" },
  { provider: "QuickBooks", file: "quickbooks", invoke: "getAllCustomers" },
  { provider: "Google Calendar", file: "google-calendar", invoke: "listCalendars" },
] as const;

function adapter(file: string, fetcher: typeof fetch) {
  return loadServerModule<Record<string, (...args: unknown[]) => Promise<{ ok: boolean; message?: string; reason?: string; data?: unknown }>>>(
    "src/lib/integrations/" + file + "-api.ts",
    { ["@/lib/integrations/" + file + "-connection"]: { getValidAccessToken: async () => ({ ok: true, accessToken: "test-access", realmId: "123" }) } },
    fetcher,
  );
}

for (const { provider, file, invoke } of adapters) {
  test(provider + " reports malformed JSON as an integration error without crashing", async () => {
    const api = adapter(file, async () => new Response("<html>proxy failure</html>"));
    await expect(api[invoke]()).resolves.toMatchObject({ ok: false });
  });
  test(provider + " rejects a malformed success envelope rather than claiming an empty account", async () => {
    const api = adapter(file, async () => Response.json({ unexpected: [] }));
    await expect(api[invoke]()).resolves.toMatchObject({ ok: false });
  });
  test(provider + " never exposes a raw API error body", async () => {
    const api = adapter(file, async () => new Response("test-sensitive-response-body", { status: 502 }));
    const result = await api[invoke]();
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("test-sensitive-response-body");
  });
  test(provider + " requests fresh reads with an abort signal", async () => {
    const requests: RequestInit[] = [];
    const api = adapter(file, async (_url, init) => { requests.push(init ?? {}); return new Response(null, { status: 503 }); });
    await api[invoke]();
    expect(requests[0].cache).toBe("no-store");
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });
}

test("QuickBooks company verification uses one authorization snapshot", async () => {
  let calls = 0;
  const urls: string[] = [];
  const api = loadServerModule<typeof import("../src/lib/integrations/quickbooks-api")>("src/lib/integrations/quickbooks-api.ts", {
    "@/lib/integrations/quickbooks-connection": { getValidAccessToken: async () => ({ ok: true, accessToken: "test", realmId: String(++calls) }) },
  }, async (url) => { urls.push(String(url)); return Response.json({ CompanyInfo: { CompanyName: "Test company" } }); });
  expect((await api.getCompanyInfo()).ok).toBe(true);
  expect(urls).toHaveLength(1);
  const path = new URL(urls[0]).pathname;
  expect(path).toBe("/v3/company/1/companyinfo/1");
  expect(calls).toBe(1);
});

test("QuickBooks rejects a successful response with missing company information", async () => {
  const api = adapter("quickbooks", async () => Response.json({}));
  await expect(api.getCompanyInfo()).resolves.toMatchObject({ ok: false });
});

test("Google event pagination does not show the same event twice", async () => {
  const event = { id: "e1", summary: "Test", status: "confirmed", start: { date: "2026-10-03" }, end: { date: "2026-10-04" } };
  const api = adapter("google-calendar", async input => Response.json(
    new URL(String(input)).searchParams.has("pageToken") ? { kind: "calendar#events", items: [event] } : { kind: "calendar#events", items: [event], nextPageToken: "next" }
  ));
  const result = await api.listEvents("primary", { from: "2026-10-03", to: "2026-10-04" });
  expect(result).toMatchObject({ ok: true, data: { events: [event], pages: 2 } });
});

test("Google rejects repeated page tokens without exhausting the entire API limit", async () => {
  let requests = 0;
  const api = adapter("google-calendar", async () => { requests++; return Response.json({ kind: "calendar#calendarList", items: [], nextPageToken: "repeat" }); });
  const result = await api.listCalendars();
  expect(result.ok).toBe(false);
  expect(requests).toBeLessThanOrEqual(2);
});

test("QuickBooks does not double-count an invoice repeated across pages", async () => {
  const invoice = (id: string) => ({ Id: id, TotalAmt: 65, Balance: 65, TxnDate: "2026-10-01", CustomerRef: { value: "customer-1" } });
  const first = Array.from({ length: 200 }, (_, i) => invoice(String(i + 1)));
  const api = adapter("quickbooks", async input => Response.json({ QueryResponse: {
    Invoice: new URL(String(input)).searchParams.get("query")!.includes("startposition 1 ") ? first : [invoice("200")]
  } }));
  const result = await api.getAllInvoices();
  expect(result.ok).toBe(true);
  expect((result.data as { invoices: unknown[] }).invoices).toHaveLength(200);
});

test("QuickBooks rejects invoice amounts that would corrupt financial totals", async () => {
  const api = adapter("quickbooks", async () => Response.json({ QueryResponse: { Invoice: [{ Id: "one", TotalAmt: "65", Balance: 65, TxnDate: "2026-10-01", CustomerRef: { value: "test" } }] } }));
  await expect(api.getAllInvoices()).resolves.toMatchObject({ ok: false });
});

test("Google rejects active events without a valid start instead of crashing preview", async () => {
  const api = adapter("google-calendar", async () => Response.json({ items: [{ id: "one", status: "confirmed" }] }));
  await expect(api.listEvents("primary", { from: "2026-10-03", to: "2026-10-04" })).resolves.toMatchObject({ ok: false });
});

test("Homeworks rejects malformed nested properties without crashing", async () => {
  const api = adapter("homeworks", async () => Response.json({ data: { customers: [{ id: 1, properties: "invalid" }] } }));
  await expect(api.getAllCustomers()).resolves.toMatchObject({ ok: false });
});

test("Homeworks rejects an incomplete customer envelope without crashing", async () => {
  const api = adapter("homeworks", async () => Response.json({ data: {} }));
  await expect(api.getAllCustomers()).resolves.toMatchObject({ ok: false });
});

for (const { provider, file, invoke } of adapters) {
  test(provider + " classifies rejected authorization separately from temporary errors", async () => {
    const api = adapter(file, async () => new Response(null, { status: 401 }));
    const result = await api[invoke]();
    expect(result).toMatchObject({ ok: false, reason: "reauth_required" });
  });
}
