import { test, expect } from "@playwright/test";
import { createElement, isValidElement, type ReactNode } from "react";
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

const verifiedCompany = { ok: true, companyName: "Synthetic test company", verifiedAt: "2026-10-10T05:00:00Z" };
const financialPreview = {
  ok: true, verifiedAt: "2026-10-10T05:00:00Z",
  summary: { customerCount: 3, totalInvoiced: 600, totalOutstanding: 100, overdueInvoiceCount: 1, overdueAmount: 50, paymentCount: 2, totalCollected: 500 },
};

// Exercise the actual event handlers with external actions and hook scheduling
// controlled in memory. This neither launches a browser nor contacts Intuit.
function quickBooksActions(actions: Record<string, unknown>) {
  let cursor = 0;
  let refreshCount = 0;
  const state: unknown[] = [];
  const work: Promise<unknown>[] = [];
  const { QuickBooksConnectionCard } = loadServerModule<{ QuickBooksConnectionCard: (input: Record<string, unknown>) => ReactNode }>(
    "src/components/settings/quickbooks-connection-card.tsx",
    {
      react: {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => { state[index] = value; }];
        },
        useTransition: () => [false, (run: () => Promise<unknown>) => { work.push(run()); }],
      },
      "next/navigation": { useRouter: () => ({ refresh() { refreshCount++; } }) },
      "@/lib/actions/quickbooks": actions,
    },
  );
  function tree() {
    cursor = 0;
    return QuickBooksConnectionCard({
      connected: true, connectedAt: "2026-09-25T00:00:00Z", realmId: "synthetic-realm",
      configured: true, statusError: null, urlMessage: null,
      refreshExpiresAt: "2099-01-01T00:00:00Z", statusCheckedAt: "2026-10-10T05:00:00Z",
    });
  }
  function find(node: ReactNode, label: string): (() => void) | undefined {
    if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
    if (node.props.onClick && renderToStaticMarkup(node).includes(label)) return node.props.onClick;
    return find(node.props.children, label);
  }
  return {
    html: () => renderToStaticMarkup(tree()),
    refreshes: () => refreshCount,
    async click(label: string) {
      const handler = find(tree(), label);
      expect(handler, "expected control: " + label).toBeTruthy();
      handler!();
      await Promise.all(work.splice(0));
    },
  };
}

const transportFailure = async () => { throw new Error("raw transport secret must not reach the UI"); };

test("QuickBooks verification transport failure offers recovery without leaking errors", async () => {
  let fails = true;
  const ui = quickBooksActions({ verifyQuickBooksConnection: async () => fails ? transportFailure() : verifiedCompany });
  await ui.click("Verify");
  expect(ui.html()).toContain("Company information could not be loaded");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("Verified live");
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Verify");
  expect(ui.html()).toContain("Synthetic test company");
  expect(ui.html()).toContain("Verified live");
  expect(ui.html()).not.toContain("could not be loaded");
});

test("QuickBooks failed preview removes stale financial figures and supports retry", async () => {
  let fails = false;
  const ui = quickBooksActions({ previewQuickBooksFinancials: async () => fails ? transportFailure() : financialPreview });
  await ui.click("Preview financial");
  expect(ui.html()).toContain("Total invoiced");
  fails = true;
  await ui.click("Preview financial");
  expect(ui.html()).toContain("Financial summary could not be loaded");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("Total invoiced");
  expect(ui.html()).not.toContain("Verified live");
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Preview financial");
  expect(ui.html()).toContain("Total invoiced");
  expect(ui.html()).not.toContain("could not be loaded");
});

test("lost QuickBooks disconnect response does not imply successful removal", async () => {
  const ui = quickBooksActions({ verifyQuickBooksConnection: async () => verifiedCompany, disconnectQuickBooksAction: transportFailure });
  await ui.click("Verify");
  await ui.click("Disconnect");
  expect(ui.html()).toContain("Disconnect could not be confirmed");
  expect(ui.html()).toContain("Reload Settings");
  expect(ui.html()).toContain("synthetic-realm");
  expect(ui.html()).not.toContain("Verified live");
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(0);
});

test("QuickBooks provider denial stays actionable and announced to assistive technology", async () => {
  const ui = quickBooksActions({ verifyQuickBooksConnection: async () => ({ ok: false, reason: "reauth_required", message: "Authorization needs reconnect." }) });
  await ui.click("Verify");
  expect(ui.html()).toContain("Needs reconnect");
  expect(ui.html()).toContain("Authorization needs reconnect.");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).toContain("Reconnect QuickBooks");
  expect(ui.html()).not.toContain("Verified live");
});

test("successful QuickBooks disconnect refreshes saved state and clears old verification", async () => {
  const ui = quickBooksActions({ verifyQuickBooksConnection: async () => verifiedCompany, disconnectQuickBooksAction: async () => ({ ok: true }) });
  await ui.click("Verify");
  await ui.click("Disconnect");
  expect(ui.refreshes()).toBe(1);
  expect(ui.html()).not.toContain("Verified live");
  expect(ui.html()).not.toContain("could not be confirmed");
});
