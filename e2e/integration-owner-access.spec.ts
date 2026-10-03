import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

for (const provider of ["homeworks", "quickbooks", "google-calendar"] as const) {
  for (const scenario of ["employee", "inactive", "missing", "outage", "signed_out"] as const) {
    test(provider + " denies privileged OAuth store access for " + scenario, async () => {
      let adminReads = 0;
      const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async () => {
        if (scenario === "outage") return Response.json({ message: "Test membership unavailable" }, { status: 500 });
        return Response.json(scenario === "missing" ? [] : [{ user_id: "test-user", role: scenario === "employee" ? "employee" : "owner", active: scenario !== "inactive" }]);
      } } });
      const store = loadServerModule<{ getValidAccessToken: () => Promise<{ ok: boolean }>; saveConnection: (...args: unknown[]) => Promise<{ ok: boolean }>; getConnectionStatus: () => Promise<{ connected: boolean }> }>("src/lib/integrations/" + provider + "-connection.ts", {
        "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: scenario === "signed_out" ? null : { id: "test-user" } }, error: null }) }, from: client.from.bind(client) }) },
        "@/lib/supabase/admin": { createSupabaseAdminClient: () => { adminReads++; return client; } },
      });
      expect((await store.getValidAccessToken()).ok).toBe(false);
      expect((await store.getConnectionStatus()).connected).toBe(false);
      expect((await store.saveConnection({ access_token: "test", refresh_token: "test", expires_in: 3600 }, "test-user", "test-user")).ok).toBe(false);
      expect(adminReads).toBe(0);
    });
  }
}

test("an active owner's verified membership permits integration access", async () => {
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input));
    expect(url.pathname).toContain("/app_members");
    expect(url.searchParams.get("user_id")).toBe("eq.test-owner");
    return Response.json([{ role: "owner", active: true }]);
  } } });
  const access = loadServerModule<typeof import("../src/lib/integrations/owner-auth")>("src/lib/integrations/owner-auth.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-owner" } }, error: null }) }, from: client.from.bind(client) }) },
  });
  expect(await access.requireIntegrationOwner()).toEqual({ ok: true, userId: "test-owner" });
});
