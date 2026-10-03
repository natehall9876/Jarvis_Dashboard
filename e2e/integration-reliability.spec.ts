import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";
import type * as HomeworksConnection from "../src/lib/integrations/homeworks-connection";
import type * as GoogleApi from "../src/lib/integrations/google-calendar-api";

const tokenResponse = { access_token: "test-new-access", refresh_token: "test-new-refresh", expires_in: 3600, x_refresh_token_expires_in: 8640000, scope: "test-scope", token_type: "bearer" };
const providers = ["homeworks", "quickbooks", "google-calendar"] as const;

for (const provider of providers) {
  test.describe(provider + " connection persistence", () => {
    function fixture(options: { failWrite?: boolean; missingConfig?: boolean } = {}) {
      let refreshCalls = 0;
      let rows: Record<string, unknown>[] = [{
        id: "11111111-1111-4111-8111-111111111111", access_token: "test-old-access", refresh_token: "test-old-refresh",
        expires_at: "2000-01-01T00:00:00Z", access_token_expires_at: "2000-01-01T00:00:00Z",
        refresh_token_expires_at: "2099-01-01T00:00:00Z", realm_id: "123", selected_calendar_id: "old-account-calendar", selected_calendar_summary: "Old account", created_at: "2026-09-01T00:00:00Z",
      }];
      const client = createClient("https://example.supabase.co", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (_url, init) => {
          const method = init?.method ?? "GET";
          if (method === "GET") return Response.json(rows);
          if (method === "DELETE") { rows = []; return new Response(null, { status: 204 }); }
          if (options.failWrite) return Response.json({ message: "simulated storage outage", code: "XX000" }, { status: 500 });
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          rows = [{ ...rows[0], ...body }];
          return init?.headers && new Headers(init.headers).get("prefer")?.includes("return=representation")
            ? Response.json(rows) : new Response(null, { status: 204 });
        } },
      });
      const connection = loadServerModule<typeof HomeworksConnection>("src/lib/integrations/" + provider + "-connection.ts", {
        "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
        "@/lib/supabase/admin": { createSupabaseAdminClient: () => { if (options.missingConfig) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing"); return client; } },
        ["@/lib/integrations/" + provider + "-oauth"]: { refreshAccessToken: async () => { refreshCalls++; return { ok: true, data: tokenResponse }; } },
      });
      return { module: connection, rows: () => rows, refreshCalls: () => refreshCalls };
    }

    test("a failed reconnect preserves the previously stored connection", async () => {
      const f = fixture({ failWrite: true });
      const save = f.module.saveConnection as (...args: unknown[]) => Promise<{ ok: boolean }>;
      const result = await save(tokenResponse, ...(provider === "quickbooks" ? ["123", "owner"] : ["owner"]));
      expect(result.ok).toBe(false);
      expect(f.rows()).toHaveLength(1);
      expect(f.rows()[0].refresh_token).toBe("test-old-refresh");
    });

    if (provider === "google-calendar") test("reconnecting requires choosing a calendar for the newly authorized account", async () => {
      const f = fixture();
      const result = await f.module.saveConnection(tokenResponse, "owner");
      expect(result.ok).toBe(true);
      expect(f.rows()[0].selected_calendar_id).toBeNull();
      expect(f.rows()[0].selected_calendar_summary).toBeNull();
    });

    test("a refresh is not reported successful when rotated tokens cannot be saved", async () => {
      const f = fixture({ failWrite: true });
      const result = await f.module.getValidAccessToken();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/sav|persist/i);
    });

    test("parallel API reads share one refresh in a server process", async () => {
      const f = fixture();
      const results = await Promise.all([f.module.getValidAccessToken(), f.module.getValidAccessToken(), f.module.getValidAccessToken()]);
      expect(results.every(result => result.ok)).toBe(true);
      expect(f.refreshCalls()).toBe(1);
    });

    test("missing admin configuration is a token result rather than an action crash", async () => {
      const f = fixture({ missingConfig: true });
      await expect(f.module.getValidAccessToken()).resolves.toMatchObject({ ok: false });
    });

    test("successful refresh persists the new access token", async () => {
      const f = fixture();
      const result = await f.module.getValidAccessToken();
      expect(result.ok).toBe(true);
      expect(f.rows()[0].access_token).toBe("test-new-access");
    });

    test("missing admin configuration is a status error instead of a settings crash", async () => {
      const f = fixture({ missingConfig: true });
      await expect(f.module.getConnectionStatus()).resolves.toMatchObject({ connected: false, error: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY") });
    });
  });
}

test("Google Calendar uses Eastern calendar-day boundaries across spring DST", async () => {
  const requests: URL[] = [];
  const api = loadServerModule<typeof GoogleApi>("src/lib/integrations/google-calendar-api.ts", {
    "@/lib/integrations/google-calendar-connection": { getValidAccessToken: async () => ({ ok: true, accessToken: "test-token" }) },
  }, async (input) => { requests.push(new URL(String(input))); return Response.json({ items: [] }); });
  expect((await api.listEvents("primary", { from: "2026-03-08", to: "2026-03-08" })).ok).toBe(true);
  expect(requests[0].searchParams.get("timeMin")).toBe("2026-03-08T05:00:00.000Z");
  expect(requests[0].searchParams.get("timeMax")).toBe("2026-03-09T04:00:00.000Z");
});

test("Google Calendar accepts empty pages and follows calendar-list pagination", async () => {
  const api = loadServerModule<typeof GoogleApi>("src/lib/integrations/google-calendar-api.ts", {
    "@/lib/integrations/google-calendar-connection": { getValidAccessToken: async () => ({ ok: true, accessToken: "test-token" }) },
  }, async (input) => {
    const url = new URL(String(input));
    return Response.json(url.searchParams.has("pageToken") ? { items: [{ id: "work", summary: "Work" }] } : { nextPageToken: "second" });
  });
  await expect(api.listCalendars()).resolves.toEqual({ ok: true, data: [{ id: "work", summary: "Work" }] });
});

test("a direct Homeworks sync never claims a webhook delivery by default", async () => {
  const events: { eventType: string }[] = [];
  const sync = loadServerModule<typeof import("../src/lib/integrations/homeworks-sync")>("src/lib/integrations/homeworks-sync.ts", {
    "@/lib/data/activity-log": { logActivity: async (event: { eventType: string }) => { events.push(event); } },
    "@/lib/integrations/homeworks-sync-failures": { logSyncFailure: async () => {} },
    "@/lib/data/shared": { extractErrorMessage: (error: unknown) => String(error) },
  });
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json({ id: "test-row" }) },
  });
  expect((await sync.syncHomeworksEntity(client, { entity_type: "customer", homeworks_id: "test-customer" })).ok).toBe(true);
  expect(events[0].eventType).toBe("homeworks_bulk_import");
});

test("malformed token expiry is treated as expired", () => {
  const expiry = loadServerModule<typeof import("../src/lib/integrations/token-expiry")>("src/lib/integrations/token-expiry.ts");
  expect(expiry.isExpiringWithin("invalid", 120000)).toBe(true);
});

test("Homeworks preview reports an unavailable schedule instead of zero jobs", async () => {
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json([]) } });
  const preview = loadServerModule<typeof import("../src/lib/actions/homeworks-sync-preview")>("src/lib/actions/homeworks-sync-preview.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/integrations/homeworks-api": {
      getAllCustomers: async () => ({ ok: true, data: { customers: [], pageCount: 1, hitCap: false } }),
      getConnectedAccount: async () => ({ ok: false, message: "Unavailable" }),
      getUpcomingJobs: async () => ({ ok: false, message: "Schedule API unavailable" }),
    },
  });
  const result = await preview.previewHomeworksSync();
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.upcomingJobCount).toBeNull();
});

test("Homeworks refuses a truncated customer import before any database write", async () => {
  let writes = 0;
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => Response.json([]) } });
  const action = loadServerModule<typeof import("../src/lib/actions/homeworks-import")>("src/lib/actions/homeworks-import.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/integrations/homeworks-api": { getAllCustomers: async () => ({ ok: true, data: { customers: [], pageCount: 20, hitCap: true } }) },
    "@/lib/integrations/homeworks-sync": { syncHomeworksEntity: async () => { writes++; return { ok: true }; } },
  });
  const result = await action.confirmHomeworksImport();
  expect(result.ok).toBe(false);
  expect(writes).toBe(0);
});

test("Homeworks webhook card does not treat manually imported customers as a verified push connection", async () => {
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false }, global: { fetch: async () => new Response("[]", { headers: { "content-type": "application/json", "content-range": "0-24/25" } }) },
  });
  const cards = loadServerModule<typeof import("../src/lib/data/integrations")>("src/lib/data/integrations.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    "@/lib/env": { isSupabaseConfigured: () => true },
    "@/lib/env.server": { isIntegrationConfigured: () => false, integrationEnv: {}, homeworksWebhookEnv: { secret: "test" }, supabaseServiceRoleKey: "test" },
    "@/lib/integrations/weather": { getWeatherForCoordinates: async () => null },
  });
  expect((await cards.getIntegrationCards()).find(card => card.key === "homeworks")?.status).not.toBe("connected");
});

for (const provider of providers) {
  test(provider + " rejects malformed token success responses", async () => {
    const oauth = loadServerModule<{ refreshAccessToken: (token: string) => Promise<{ ok: boolean }> }>("src/lib/integrations/" + provider + "-oauth.ts", {
      "@/lib/env.server": { homeworksOAuthEnv: { clientId: "test" }, integrationEnv: { quickbooks: { clientId: "test", clientSecret: "test" }, googleCalendar: { clientId: "test", clientSecret: "test" } } },
    }, async () => Response.json({ access_token: "test-access", expires_in: "invalid" }));
    await expect(oauth.refreshAccessToken("test-refresh")).resolves.toMatchObject({ ok: false });
  });
}

for (const [provider, parameter, cookie] of [
  ["homeworks", "homeworks_message", "hw_oauth_state"],
  ["quickbooks", "quickbooks_message", "qb_oauth_state"],
  ["google-calendar", "gcal_message", "gcal_oauth_state"],
] as const) {
  test(provider + " callback reports declined authorization and clears path-scoped cookies", async () => {
    const route = loadServerModule<{ GET: (request: Request) => Promise<Response> }>("src/app/api/integrations/" + provider + "/oauth/callback/route.ts", {
      "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
      ["@/lib/integrations/" + provider + "-connection"]: { saveConnection: async () => { throw new Error("Must not save a declined authorization"); } },
      ["@/lib/integrations/" + provider + "-oauth"]: { exchangeCodeForToken: async () => { throw new Error("Must not exchange a declined authorization"); } },
    });
    const response = await route.GET(new Request("https://jarvis.example/api/integrations/" + provider + "/oauth/callback?error=access_denied"));
    expect(new URL(response.headers.get("location")!).searchParams.get(parameter)).toContain("access_denied");
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain(cookie + "=");
    expect(cookies).toContain("Path=/api/integrations/" + provider + "/oauth");
    expect(cookies).toContain("Max-Age=0");
  });
}
