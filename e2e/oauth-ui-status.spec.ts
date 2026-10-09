import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";

function renderQuickBooks(overrides: Record<string, unknown> = {}) {
  const loaded = loadServerModule<{ QuickBooksConnectionCard: React.ComponentType<Record<string, unknown>> }>("src/components/settings/quickbooks-connection-card.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/actions/quickbooks": {},
  });
  return renderToStaticMarkup(createElement(loaded.QuickBooksConnectionCard, { statusCheckedAt: "2026-10-03T12:00:00Z", connected: true, connectedAt: "2026-09-25T00:00:00Z", realmId: "123", configured: true, statusError: null, urlMessage: null, refreshExpiresAt: "2099-01-01T00:00:00Z", ...overrides }));
}

test("QuickBooks distinguishes an expired saved authorization and offers reconnect", () => {
  const html = renderQuickBooks({ refreshExpiresAt: "2000-01-01T00:00:00Z" });
  expect(html).toContain("Expired");
  expect(html).toContain("Reconnect QuickBooks");
});

test("QuickBooks labels an unverified stored token as saved authorization", () => {
  const html = renderQuickBooks();
  expect(html).toContain("Saved authorization");
  expect(html).not.toContain("Verified live");
});

test("a forged success query cannot claim an authorization was saved", () => {
  const html = renderQuickBooks({ connected: false, urlMessage: { status: "connected" } });
  expect(html).not.toContain("Authorization saved -");
});

test("QuickBooks presents the complete production callback URI", () => {
  const html = renderQuickBooks({ configured: false });
  expect(html).toContain("https://jarvis-dashboard-fawn.vercel.app/api/integrations/quickbooks/oauth/callback");
});


test("saved QuickBooks authorization can be replaced without disconnecting first", () => {
  const html = renderQuickBooks();
  expect(html).toContain("Reconnect QuickBooks");
  expect(html).toContain("kept until");
});
