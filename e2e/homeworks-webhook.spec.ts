import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";

type Route = { POST: (request: Request) => Promise<Response> };

for (const routeName of ["webhook", "import"]) {
  for (const [configured, supplied, expected] of [
    [undefined, "wrong", 503],
    ["fixture-secret", "CANARY-wrong-secret", 401],
    ["fixture-secret", "fixture-secret", 410],
  ] as const) {
    test(`retired ${routeName} preserves auth and returns ${expected} without database access`, async () => {
      let databaseCalls = 0;
      const forbidden = () => { databaseCalls++; throw new Error("Database must not be accessed"); };
      const route = loadServerModule<Route>(`src/app/api/integrations/homeworks/${routeName}/route.ts`, {
        "@/lib/env.server": { homeworksWebhookEnv: { secret: configured } },
        "@/lib/supabase/admin": { createSupabaseAdminClient: forbidden },
        "@/lib/supabase/server": { createSupabaseServerClient: forbidden },
      });
      // Even malformed bodies receive the retired response after authentication.
      const response = await route.POST(new Request("https://jarvis.test/api/retired", { method: "POST", headers: { "x-homeworks-webhook-secret": supplied }, body: "not JSON" }));
      expect(response.status).toBe(expected);
      const body = await response.text();
      expect(body).not.toContain("CANARY-wrong-secret");
      if (expected === 410) expect(body).toContain("Automatic Homeworks sync is authoritative");
      expect(databaseCalls).toBe(0);
    });
  }

  test(`retired ${routeName} cannot be revived with a valid import or dry-run payload`, async () => {
    let databaseCalls = 0;
    const forbidden = () => { databaseCalls++; throw new Error("Database must not be accessed"); };
    const route = loadServerModule<Route>(`src/app/api/integrations/homeworks/${routeName}/route.ts`, {
      "@/lib/env.server": { homeworksWebhookEnv: { secret: "fixture-secret" } },
      "@/lib/supabase/admin": { createSupabaseAdminClient: forbidden },
    });
    for (const dry_run of [false, true]) {
      const response = await route.POST(new Request("https://jarvis.test/api/retired", {
        method: "POST", headers: { "x-homeworks-webhook-secret": "fixture-secret", "content-type": "application/json" },
        body: JSON.stringify({ entity_type: "customer", homeworks_id: "customer-1", records: [{ entity_type: "customer", homeworks_id: "customer-1" }], dry_run }),
      }));
      expect(response.status).toBe(410);
    }
    expect(databaseCalls).toBe(0);
  });
}

for (const signedIn of [false, true]) {
  test(`retired admin import ${signedIn ? "returns 410 after session check" : "rejects unauthenticated callers"}`, async () => {
    const calls: string[] = [];
    const client = new Proxy({ auth: { getUser: async () => { calls.push("auth"); return { data: { user: signedIn ? { id: "owner" } : null } }; } } }, {
      get(target, property) {
        if (property === "auth") return target.auth;
        if (property === "then") return undefined;
        calls.push(String(property));
        throw new Error("No business records should be accessed");
      },
    });
    const route = loadServerModule<{ POST: () => Promise<Response> }>("src/app/api/integrations/homeworks/admin-import/route.ts", {
      "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
    });
    const response = await route.POST();
    expect(response.status).toBe(signedIn ? 410 : 401);
    expect(calls).toEqual(["auth"]);
  });
}
