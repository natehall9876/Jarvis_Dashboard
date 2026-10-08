import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import { NextRequest } from "next/server";

type AuthError = { name: string; code?: string; status?: number; message?: string } | null;
async function runProxy(error: AuthError, options: { user?: boolean; path?: string; prefetch?: boolean; throws?: boolean } = {}) {
  const loaded = loadServerModule<{ proxy: (request: NextRequest) => Promise<Response> }>("src/proxy.ts", {
    "@/lib/env": { supabaseEnv: { url: "https://fixture.supabase.co", publishableKey: "fixture-public-key" } },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => {
      if (options.throws) throw new Error("private upstream details");
      return { data: { user: options.user ? { id: "owner" } : null }, error };
    } } }) },
  });
  return loaded.proxy(new NextRequest("https://jarvis.example" + (options.path ?? "/schedule?date=2026-10-10"), {
    headers: options.prefetch ? { "next-router-prefetch": "1" } : {},
  }));
}

for (const code of ["refresh_token_not_found", "session_not_found", "bad_jwt"]) {
  test(`expired or invalid session ${code} cannot render an empty dashboard`, async () => {
    const response = await runProxy({ name: "AuthApiError", code, status: 400 });
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("redirectTo")).toBe("/schedule?date=2026-10-10");
  });
}

for (const error of [
  { name: "AuthRetryableFetchError", status: 503 },
  { name: "AuthApiError", code: "over_request_rate_limit", status: 429 },
  { name: "AuthApiError", code: "refresh_token_already_used", status: 400 },
]) {
  test(`temporary auth failure ${error.name} ${error.status} blocks misleading business totals without clearing cookies`, async () => {
    const response = await runProxy(error);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.text();
    expect(body).toContain("Your business data has not been loaded");
    expect(body).toContain('href="/login');
    expect(body).not.toContain("private upstream details");
  });
}

test("thrown auth outage is a recoverable page rather than a crash", async () => {
  expect((await runProxy(null, { throws: true })).status).toBe(503);
});

test("validated owner retains access", async () => {
  expect((await runProxy(null, { user: true })).headers.get("x-middleware-next")).toBe("1");
});

test("a missing session returns to the requested date after login", async () => {
  const response = await runProxy({ name: "AuthSessionMissingError" });
  expect(new URL(response.headers.get("location")!).searchParams.get("redirectTo")).toBe("/schedule?date=2026-10-10");
});

test("background API keeps its own authentication response", async () => {
  const response = await runProxy({ name: "AuthApiError", code: "session_not_found" }, { path: "/api/integrations/homeworks/scheduled" });
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("login stays available during an expired session", async () => {
  expect((await runProxy({ name: "AuthApiError", code: "session_not_found" }, { path: "/login" })).headers.get("x-middleware-next")).toBe("1");
});

test("prefetch cannot cache an unauthenticated empty dashboard", async () => {
  const response = await runProxy({ name: "AuthApiError", code: "session_not_found" }, { prefetch: true });
  expect(response.status).toBe(307);
});

test("the production matcher also guards Link prefetch requests", async () => {
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server.js");
  const { config } = loadServerModule<{ config: object }>("src/proxy.ts", {
    "@/lib/env": { supabaseEnv: { url: "", publishableKey: "" } },
  });
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "https://jarvis.example/schedule", headers: { "next-router-prefetch": "1", purpose: "prefetch" } })).toBe(true);
});
