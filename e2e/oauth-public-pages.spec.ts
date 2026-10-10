import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { loadServerModule } from "./load-server-module";

function proxyFor(authUnavailable: boolean) {
  let authCalls = 0;
  const { proxy } = loadServerModule<{ proxy: (request: NextRequest) => Promise<Response> }>("src/proxy.ts", {
    "@/lib/env": { supabaseEnv: { url: "https://fixture.supabase.co", publishableKey: "test-key" } },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => {
      authCalls++;
      if (authUnavailable) throw new Error("test outage");
      return { data: { user: null }, error: { name: "AuthSessionMissingError" } };
    } } }) },
  });
  return { proxy, calls: () => authCalls };
}

for (const path of ["/about", "/privacy", "/terms"]) {
  for (const unavailable of [false, true]) {
    test(`${path} is readable without account data when auth unavailable=${unavailable}`, async () => {
      const auth = proxyFor(unavailable);
      const response = await auth.proxy(new NextRequest("https://jarvis.example" + path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(auth.calls()).toBe(0);
    });
  }
}

for (const path of ["/", "/schedule", "/settings", "/clients", "/about-private", "/privacy/records", "/terms-and-records"]) {
  test(`public information does not expose ${path}`, async () => {
    const auth = proxyFor(false);
    const response = await auth.proxy(new NextRequest("https://jarvis.example" + path));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("redirectTo")).toBe(path);
    expect(auth.calls()).toBe(1);
  });
}
