import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

const tokens = { access_token: "new-access-test", refresh_token: "new-refresh-test", expires_in: 3600, x_refresh_token_expires_in: 8640000, token_type: "bearer", scope: "test" };
const providers = ["homeworks", "quickbooks", "google-calendar"] as const;
type Store = {
  saveConnection: (...args: unknown[]) => Promise<{ ok: boolean }>;
  getValidAccessToken: () => Promise<{ ok: boolean; reason?: string }>;
  [key: string]: (...args: never[]) => Promise<unknown>;
};

function fixture(provider: typeof providers[number], options: { missingAdmin?: boolean; lookupError?: boolean; deleteError?: boolean; reauth?: boolean; switched?: boolean; noRow?: boolean } = {}) {
  let row = { id: "11111111-1111-4111-8111-111111111111", access_token: "old-access-test", refresh_token: "old-refresh-test", updated_at: "2026-10-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", expires_at: "2000-01-01T00:00:00Z", access_token_expires_at: "2000-01-01T00:00:00Z", refresh_token_expires_at: "2099-01-01T00:00:00Z", realm_id: "123" };
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    if (String(input).includes("/rpc/homeworks_claim_lease")) return Response.json(true);
    if (String(input).includes("/rpc/homeworks_release_lease")) return new Response(null,{status:204});
    const method = init?.method ?? "GET";
    if (method === "GET") return options.lookupError ? Response.json({ message: "Test database offline" }, { status: 500 }) : Response.json(options.noRow ? [] : [row]);
    if (method === "DELETE") return options.deleteError ? Response.json({ message: "Test delete denied" }, { status: 500 }) : Response.json([row]);
    const updatedFilter = new URL(String(input)).searchParams.get("updated_at");
    if (options.noRow || (updatedFilter && updatedFilter !== "eq." + row.updated_at)) return Response.json([]);
    row = { ...row, ...JSON.parse(String(init?.body)) };
    return new Headers(init?.headers).get("prefer")?.includes("return=representation") ? Response.json([row]) : new Response(null, { status: 204 });
  } } });
  const store = loadServerModule<Store>("src/lib/integrations/" + provider + "-connection.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
    "@/lib/integrations/owner-auth": { requireIntegrationOwner: async () => ({ ok: true, userId: "owner" }) },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => { if (options.missingAdmin) throw new Error("Test admin unavailable"); return client; } },
    ["@/lib/integrations/" + provider + "-oauth"]: {
      refreshAccessToken: async () => {
        if (options.reauth) return { ok: false, message: "Test revoked authorization", reauthRequired: true };
        if (options.switched) row = { ...row, access_token: "replacement-account-access", refresh_token: "replacement-account-refresh", updated_at: "2026-10-03T00:00:00Z" };
        return { ok: true, data: tokens };
      },
      revokeToken: async () => {},
    },
  });
  return { store, row: () => row };
}

for (const provider of providers) {
  test(provider + " confirms a successful stored authorization disconnect", async () => {
    const f = fixture(provider);
    const name = provider === "homeworks" ? "disconnectHomeworks" : provider === "quickbooks" ? "disconnectQuickBooks" : "disconnectGoogleCalendar";
    await expect(f.store[name]()).resolves.toMatchObject({ ok: true });
  });
  test(provider + " reports missing token-store configuration from callback save", async () => {
    const f = fixture(provider, { missingAdmin: true });
    await expect(f.store.saveConnection(tokens, ...(provider === "quickbooks" ? ["123", "owner"] : ["owner"]))).resolves.toMatchObject({ ok: false });
  });
  test(provider + " does not call a token-store outage disconnected", async () => {
    const f = fixture(provider, { lookupError: true });
    const result = await f.store.getValidAccessToken();
    expect(result).toMatchObject({ ok: false, reason: "refresh_failed" });
  });
  test(provider + " reports revoked refresh authorization as needing reconnect", async () => {
    const f = fixture(provider, { reauth: true });
    await expect(f.store.getValidAccessToken()).resolves.toMatchObject({ ok: false, reason: "reauth_required" });
  });
  test(provider + " cannot overwrite a reconnect that happened during refresh", async () => {
    const f = fixture(provider, { switched: true });
    expect((await f.store.getValidAccessToken()).ok).toBe(false);
    expect(f.row().refresh_token).toBe("replacement-account-refresh");
    expect(f.row().access_token).toBe("replacement-account-access");
  });
  test(provider + " reports failure when its saved authorization cannot be disconnected", async () => {
    const f = fixture(provider, { deleteError: true });
    const name = provider === "homeworks" ? "disconnectHomeworks" : provider === "quickbooks" ? "disconnectQuickBooks" : "disconnectGoogleCalendar";
    await expect(f.store[name]()).resolves.toMatchObject({ ok: false });
  });
}

test("Google calendar selection fails if the authorization row disappeared", async () => {
  const f = fixture("google-calendar", { noRow: true });
  await expect(f.store.selectCalendar(...(["calendar", "Test", f.row().updated_at] as never[]))).resolves.toMatchObject({ ok: false });
});

for (const provider of providers) {
  test(provider + " identifies invalid_grant without leaking the raw token error", async () => {
    const oauth = loadServerModule<{ refreshAccessToken: (token: string) => Promise<{ ok: boolean; message?: string; reauthRequired?: boolean }> }>("src/lib/integrations/" + provider + "-oauth.ts", {
      "@/lib/env.server": { homeworksOAuthEnv: { clientId: "test" }, integrationEnv: { quickbooks: { clientId: "test", clientSecret: "test" }, googleCalendar: { clientId: "test", clientSecret: "test" } } },
    }, async () => Response.json({ error: "invalid_grant", error_description: "sensitive-test-content" }, { status: 400 }));
    const result = await oauth.refreshAccessToken("test");
    expect(result).toMatchObject({ ok: false, reauthRequired: true });
    expect(result.message).not.toContain("sensitive-test-content");
  });
}

test("Google rejects a calendar choice from an authorization replaced in another tab", async () => {
  const f = fixture("google-calendar");
  const listedVersion = f.row().updated_at;
  expect((await f.store.saveConnection(tokens, "owner")).ok).toBe(true);
  await expect(f.store.selectCalendar(...(["old-account-calendar", "Old account", listedVersion] as never[]))).resolves.toMatchObject({ ok: false });
});
test("Google accepts a calendar choice from the current authorization", async () => {
  const f = fixture("google-calendar");
  await expect(f.store.selectCalendar(...(["current-calendar", "Current account", f.row().updated_at] as never[]))).resolves.toMatchObject({ ok: true });
});
