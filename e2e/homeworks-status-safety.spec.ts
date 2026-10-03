import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadServerModule } from "./load-server-module";

function fixture(fail?: string) {
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    if (table === fail) return Response.json({ message: "Test history unavailable" }, { status: 500 });
    if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
    return Response.json([]);
  } } });
  return loadServerModule<typeof import("../src/lib/actions/homeworks-sync-status")>("src/lib/actions/homeworks-sync-status.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
  });
}
for (const table of ["activity_log", "homeworks_sync_failures"]) {
  test("Homeworks " + table + " read failure cannot become Never or no failures", async () => {
    expect((await fixture(table).getHomeworksSyncStatus()).ok).toBe(false);
  });
}
test("successfully read empty Homeworks history remains a valid empty status", async () => {
  expect(await fixture().getHomeworksSyncStatus()).toMatchObject({ ok: true, status: { lastWebhookDeliveryAt: null, recentFailures: [] } });
});
