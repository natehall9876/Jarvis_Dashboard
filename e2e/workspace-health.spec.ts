import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";

type Health = { checkedAt: string; services: { id: string; state: string; detail: string }[] };
function api(overrides: Record<string, unknown> = {}) {
  return loadServerModule<{ getWorkspaceReadiness?: () => Promise<Health> }>("src/lib/data/integrations.ts", {
    "@/lib/env.server": { isIntegrationConfigured: (key: string) => key !== "googleCalendar", integrationEnv: {}, homeworksWebhookEnv: {}, supabaseServiceRoleKey: "" },
    "@/lib/integrations/quickbooks-api": { getCompanyInfo: async () => ({ ok: false, reason: "forbidden", message: "QuickBooks denied this read (HTTP 403; Intuit code 3100)." }) },
    "@/lib/integrations/google-calendar-connection": { getConnectionStatus: async () => { throw new Error("must not read an unconfigured integration"); } },
    ...overrides,
  });
}

test("workspace distinguishes configured AI from verified access and shows provider denial", async () => {
  const subject = api();
  expect(typeof subject.getWorkspaceReadiness).toBe("function");
  const result = await subject.getWorkspaceReadiness!();
  expect(result.services.find(s => s.id === "ai")?.state).toBe("ready");
  expect(result.services.find(s => s.id === "quickbooks")).toMatchObject({ state: "attention", detail: expect.stringContaining("3100") });
  expect(result.services.find(s => s.id === "calendar")?.state).toBe("setup");
  expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);
});

test("provider exceptions do not hide the other services or leak a raw exception", async () => {
  const subject = api({ "@/lib/integrations/quickbooks-api": { getCompanyInfo: async () => { throw new Error("private diagnostic secret"); } } });
  expect(typeof subject.getWorkspaceReadiness).toBe("function");
  const result = await subject.getWorkspaceReadiness!();
  expect(result.services).toHaveLength(3);
  expect(result.services.find(s => s.id === "quickbooks")?.state).toBe("attention");
  expect(JSON.stringify(result)).not.toContain("private diagnostic secret");
});

test("a selected calendar is only live after its events can actually be read", async () => {
  const subject = api({
    "@/lib/env.server": { isIntegrationConfigured: () => true, integrationEnv: {}, homeworksWebhookEnv: {}, supabaseServiceRoleKey: "" },
    "@/lib/integrations/quickbooks-api": { getCompanyInfo: async () => ({ ok: true, data: { CompanyName: "Business" } }) },
    "@/lib/integrations/google-calendar-connection": { getConnectionStatus: async () => ({ connected: true, selectedCalendarId: "primary", selectedCalendarSummary: "Work" }) },
    "@/lib/integrations/google-calendar-api": { listEvents: async () => ({ ok: false, message: "Calendar permission denied." }) },
  });
  expect(typeof subject.getWorkspaceReadiness).toBe("function");
  const result = await subject.getWorkspaceReadiness!();
  expect(result.services.find(s => s.id === "quickbooks")?.state).toBe("live");
  expect(result.services.find(s => s.id === "calendar")?.state).toBe("attention");
});

test("connection health requires an authenticated owner", async ({ request }) => {
  const result = await request.get("/api/integrations/health");
  expect(result.status()).toBe(401);
  expect(JSON.stringify(await result.json())).not.toContain("services");
});
