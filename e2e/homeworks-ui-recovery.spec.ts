import { test, expect } from "@playwright/test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";

const transportFailure = async () => { throw new Error("raw transport secret must not reach the UI"); };
const componentStubs = {
  "@/components/homeworks-managed-notice": {
    HomeworksManagedNotice: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  },
  "@/components/ui/button": {
    Button: (props: Record<string, unknown> & { children?: ReactNode }) => createElement("button", props, props.children),
  },
  "@/components/ui/card": {
    Card: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
    CardBody: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    CardHeader: ({ title, description }: { title: string; description: string }) => createElement("header", null, title, description),
  },
  "@/components/settings/homeworks-reconcile-panel": { HomeworksReconcilePanel: () => createElement("div") },
  "@/components/settings/homeworks-sync-status-panel": { HomeworksSyncStatusPanel: () => createElement("div") },
};

function hookHarness(render: (hooks: Record<string, unknown>) => ReactNode) {
  let cursor = 0;
  let refreshCount = 0;
  const state: unknown[] = [];
  const work: Promise<unknown>[] = [];
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? (value as (prior: unknown) => unknown)(state[index]) : value; }];
    },
    useTransition: () => [false, (run: () => Promise<unknown>) => { work.push(run()); }],
    router: { refresh() { refreshCount++; } },
  };
  function tree() {
    cursor = 0;
    return render(hooks);
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
      await Promise.allSettled(work.splice(0));
    },
  };
}

function connectionActions(actions: Record<string, unknown>) {
  return hookHarness((hooks) => {
    const loaded = loadServerModule<{ HomeworksConnectionCard: (input: Record<string, unknown>) => ReactNode }>(
      "src/components/settings/homeworks-connection-card.tsx",
      {
        react: { useState: hooks.useState, useTransition: hooks.useTransition },
        "next/navigation": { useRouter: () => hooks.router },
        "@/lib/actions/homeworks-oauth": actions,
        ...componentStubs,
      },
    );
    return loaded.HomeworksConnectionCard({
      connected: true,
      connectedAt: "2026-10-10T05:00:00Z",
      configured: true,
      statusError: null,
      urlMessage: null,
    });
  });
}

function reconciliationActions(actions: Record<string, unknown>) {
  return hookHarness((hooks) => {
    const loaded = loadServerModule<{ HomeworksReconcilePanel: () => ReactNode }>(
      "src/components/settings/homeworks-reconcile-panel.tsx",
      {
        react: { useState: hooks.useState, useTransition: hooks.useTransition },
        "@/components/ui/button": componentStubs["@/components/ui/button"],
        "@/lib/actions/homeworks-reconcile": actions,
        "@/lib/integrations/homeworks-dates": {
          BUSINESS_TIMEZONE: "America/New_York",
          todayInZone: () => "2026-10-10",
          addDaysISO: () => "2026-10-16",
          currentBusinessWeek: () => ({ from: "2026-10-05", to: "2026-10-11" }),
        },
      },
    );
    return loaded.HomeworksReconcilePanel();
  });
}

test("Homeworks verification transport failure is safe, announced, and retryable", async () => {
  let fails = true;
  const ui = connectionActions({
    verifyHomeworksConnection: async () => fails ? transportFailure() : { ok: false, message: "Provider authorization denied." },
  });
  await ui.click("Verify");
  expect(ui.html()).toContain("Homeworks customers could not be loaded");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Verify");
  expect(ui.html()).toContain("Provider authorization denied.");
  expect(ui.html()).not.toContain("could not be loaded");
});

test("uncertain Homeworks disconnect preserves authorization and never claims removal", async () => {
  const ui = connectionActions({
    verifyHomeworksConnection: async () => ({ ok: true, customers: [] }),
    disconnectHomeworksAction: transportFailure,
  });
  await ui.click("Verify");
  await ui.click("Disconnect");
  expect(ui.html()).toContain("Disconnect could not be confirmed");
  expect(ui.html()).toContain("Reload Settings");
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(0);
});

test("successful Homeworks disconnect refreshes saved state", async () => {
  const ui = connectionActions({ disconnectHomeworksAction: async () => ({ ok: true }) });
  await ui.click("Disconnect");
  expect(ui.refreshes()).toBe(1);
  expect(ui.html()).not.toContain("could not be confirmed");
});

test("Homeworks day reconciliation recovers from a thrown read", async () => {
  let fails = true;
  const ui = reconciliationActions({
    reconcileHomeworksDay: async () => fails ? transportFailure() : { ok: false, message: "Provider read denied." },
    reconcileHomeworksRange: async () => ({ ok: false, message: "unused" }),
  });
  await ui.click("Reconcile this day");
  expect(ui.html()).toContain("Schedule reconciliation could not be completed");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Reconcile this day");
  expect(ui.html()).toContain("Provider read denied.");
});

test("Homeworks range reconciliation recovers from a thrown read", async () => {
  let fails = true;
  const ui = reconciliationActions({
    reconcileHomeworksDay: async () => ({ ok: false, message: "unused" }),
    reconcileHomeworksRange: async () => fails ? transportFailure() : { ok: false, message: "Provider range denied." },
  });
  await ui.click("Date range");
  await ui.click("Reconcile this range");
  expect(ui.html()).toContain("Schedule reconciliation could not be completed");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Reconcile this range");
  expect(ui.html()).toContain("Provider range denied.");
});

test("Homeworks connection failures and connect action meet accessibility requirements", () => {
  const loaded = loadServerModule<{ HomeworksConnectionCard: React.ComponentType<Record<string, unknown>> }>(
    "src/components/settings/homeworks-connection-card.tsx",
    {
      react: { useState: (initial: unknown) => [initial, () => {}], useTransition: () => [false, () => {}] },
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/actions/homeworks-oauth": {},
      ...componentStubs,
    },
  );
  const html = renderToStaticMarkup(createElement(loaded.HomeworksConnectionCard, {
    connected: false, connectedAt: null, configured: true, statusError: null,
    urlMessage: { status: "error", message: "Authorization failed." },
  }));
  expect(html).toContain('role="alert"');
  expect(html).toContain("min-h-11");
});
