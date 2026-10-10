import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ESLint } from "eslint";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";

const pageFile = "src/app/(dashboard)/homeworks/page.tsx";
const checkedAt = Date.parse("2026-10-07T04:00:00Z");
const warning = "Sync is not yet verified current";
type PageModule = { default: (props: { searchParams: Promise<{ entity?: string; page?: string }> }) => Promise<ReactElement> };

function loadPage(completedAt: string | null, authorized = true) {
  const reads: URL[] = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      reads.push(url);
      if (url.pathname.endsWith("/homeworks_sync_runs")) {
        return Response.json([{ status: "success", completed_at: completedAt, records: 0 }]);
      }
      if (url.pathname.endsWith("/homeworks_sync_state")) {
        return Response.json([{ stream: "events_active", last_success_at: completedAt, last_error: null }]);
      }
      expect(url.pathname).toBe("/rest/v1/homeworks_records");
      return Response.json([], { headers: { "content-range": "0-0/201" } });
    } },
  });
  const page = loadServerModule<PageModule>(pageFile, {
    "@/lib/integrations/owner-auth": { requireIntegrationOwner: async () => authorized ? { ok: true, userId: "test-owner" } : { ok: false, message: "Owner access required" } },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => client },
  });
  return { page, reads };
}

test("Homeworks page passes the render-purity rule without suppressions", async () => {
  const [result] = await new ESLint({ allowInlineConfig: false }).lintFiles([pageFile]);
  expect(result.messages.filter((message) => message.ruleId === "react-hooks/purity")).toEqual([]);
});

for (const { name, completedAt, stale } of [
  { name: "no completed run", completedAt: null, stale: true },
  { name: "recent completed run", completedAt: new Date(checkedAt - 5 * 60_000).toISOString(), stale: false },
  { name: "exact fifteen-minute boundary", completedAt: new Date(checkedAt - 15 * 60_000).toISOString(), stale: false },
  { name: "older than fifteen minutes", completedAt: new Date(checkedAt - 15 * 60_000 - 1).toISOString(), stale: true },
]) {
  test(`Homeworks freshness warning preserves ${name}`, async () => {
    const originalNow = Date.now;
    Date.now = () => checkedAt;
    try {
      const { page } = loadPage(completedAt);
      const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
      expect(html.includes(warning)).toBe(stale);
    } finally {
      Date.now = originalNow;
    }
  });
}

test("Homeworks reads stay owner-only and retain entity pagination", async () => {
  const denied = loadPage(null, false);
  expect(renderToStaticMarkup(await denied.page.default({ searchParams: Promise.resolve({}) }))).toContain("Owner access required");
  expect(denied.reads).toHaveLength(0);

  const allowed = loadPage(null);
  const html = renderToStaticMarkup(await allowed.page.default({ searchParams: Promise.resolve({ entity: "invoices", page: "1" }) }));
  const records = allowed.reads.find((url) => url.pathname.endsWith("/homeworks_records"))!;
  expect(records.searchParams.get("entity")).toBe("eq.invoices");
  expect(records.searchParams.get("offset")).toBe("100");
  expect(records.searchParams.get("limit")).toBe("100");
  expect(records.searchParams.get("order")).toBe("changed_at.desc,homeworks_id.asc");
  expect(html).toContain("201 invoices records");
  expect(html).toContain("Previous");
  expect(html).toContain("Next 100");
});

test("Homeworks freshness is checked again on a later request", async () => {
  const originalNow = Date.now;
  let now = checkedAt;
  Date.now = () => now;
  try {
    const { page } = loadPage(new Date(checkedAt).toISOString());
    const render = async () => renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    expect(await render()).not.toContain(warning);
    now += 15 * 60_000 + 1;
    expect(await render()).toContain(warning);
  } finally {
    Date.now = originalNow;
  }
});
