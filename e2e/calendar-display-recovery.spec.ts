import { test, expect } from "@playwright/test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";
import { formatCalendarStart } from "../src/lib/integrations/google-calendar-display";

const props = {
  connected: true, connectedAt: "2026-10-10T04:10:55Z",
  selectedCalendarId: "primary", selectedCalendarSummary: "Work calendar",
  configured: true, statusError: null, urlMessage: null,
};
const listed = { ok: true, calendars: [{ id: "primary", summary: "Work calendar" }], connectionVersion: "version-1", verifiedAt: "2026-10-10T04:12:00Z" };
const previewed = { ok: true, events: [{ id: "one", summary: "Estimate", start: "2026-10-10T17:30:00Z", isAllDay: false }], range: { from: "2026-10-10", to: "2026-10-24" }, verifiedAt: "2026-10-10T04:12:00Z" };

test("calendar preview formats the live estimate in Eastern time", () => {
  expect(formatCalendarStart("2026-10-10T17:30:00Z")).toBe("Oct 10, 2026, 1:30 PM EDT");
  expect(formatCalendarStart("2026-10-10T13:30:00-04:00")).toBe("Oct 10, 2026, 1:30 PM EDT");
});

test("calendar timestamps follow DST and retain dates around midnight", () => {
  expect(formatCalendarStart("2026-11-01T05:30:00Z")).toBe("Nov 1, 2026, 1:30 AM EDT");
  expect(formatCalendarStart("2026-11-01T06:30:00Z")).toBe("Nov 1, 2026, 1:30 AM EST");
  expect(formatCalendarStart("2026-10-10T00:30:00Z")).toBe("Oct 9, 2026, 8:30 PM EDT");
});

test("all-day dates never shift to the previous day or fabricate a time", () => {
  expect(formatCalendarStart("2026-10-10", true)).toBe("Oct 10, 2026");
  expect(formatCalendarStart("2026-03-08", true)).toBe("Mar 8, 2026");
  expect(formatCalendarStart("2026-02-30", true)).toBe("Date unavailable");
  expect(formatCalendarStart("invalid")).toBe("Time unavailable");
  expect(formatCalendarStart("")).toBe("Time unavailable");
});

function renderStatus(overrides: Record<string, unknown>) {
  const { GoogleCalendarConnectionCard } = loadServerModule<{ GoogleCalendarConnectionCard: React.ComponentType<Record<string, unknown>> }>(
    "src/components/settings/google-calendar-connection-card.tsx",
    { "next/navigation": { useRouter: () => ({ refresh() {} }) }, "@/lib/actions/google-calendar": {} },
  );
  return renderToStaticMarkup(createElement(GoogleCalendarConnectionCard, { ...props, ...overrides }));
}

test("callback confirmation respects the saved selection without claiming a live check", () => {
  const html = renderStatus({ urlMessage: { status: "connected" } });
  expect(html).toContain("Calendar selected.");
  expect(html).not.toContain("pick a calendar below");
  expect(html).toContain("not verified in this view");
  expect(html).toContain("Oct 10, 2026, 12:10 AM EDT");
  expect(html).not.toContain("Verified live at");
  expect(renderStatus({ connected: false, urlMessage: { status: "connected" } })).not.toContain("Authorization saved.");
});

test("a new connection still asks the owner to choose a calendar", () => {
  expect(renderStatus({ selectedCalendarId: null, selectedCalendarSummary: null, urlMessage: { status: "connected" } })).toContain("pick a calendar below");
});

// Exercise the real event handlers and their state updates with external actions
// stubbed. No browser or production credentials are used in these failure cases.
function harness(actions: Record<string, unknown>) {
  let cursor = 0;
  const state: unknown[] = [];
  const work: Promise<unknown>[] = [];
  let refreshes = 0;
  const { GoogleCalendarConnectionCard } = loadServerModule<{ GoogleCalendarConnectionCard: (input: typeof props) => ReactNode }>(
    "src/components/settings/google-calendar-connection-card.tsx",
    {
      react: {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => { state[index] = value; }];
        },
        useTransition: () => [false, (run: () => Promise<unknown>) => { work.push(run()); }],
      },
      "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
      "@/lib/actions/google-calendar": actions,
    },
  );
  function tree() { cursor = 0; return GoogleCalendarConnectionCard(props); }
  function find(node: ReactNode, label: string): (() => void) | undefined {
    if (Array.isArray(node)) return node.map(child => find(child, label)).find(Boolean);
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
    if (node.props.onClick && renderToStaticMarkup(node).includes(label)) return node.props.onClick;
    return find(node.props.children, label);
  }
  return {
    html: () => renderToStaticMarkup(tree()),
    refreshes: () => refreshes,
    async click(label: string) {
      const handler = find(tree(), label);
      expect(handler, "expected actionable control: " + label).toBeTruthy();
      handler!();
      await Promise.all(work.splice(0));
    },
  };
}

const fail = async () => { throw new Error("raw transport secret must never be rendered"); };

test("calendar-list transport failure is recoverable without a false live badge", async () => {
  let fails = true;
  const ui = harness({ listGoogleCalendars: async () => fails ? fail() : listed });
  await ui.click("Change calendar");
  expect(ui.html()).toContain("Calendar list could not be loaded");
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.html()).not.toContain("Verified live at");
  fails = false;
  await ui.click("Change calendar");
  expect(ui.html()).not.toContain("could not be loaded");
  expect(ui.html()).toContain("Verified live at");
});

test("preview failure clears stale success and permits a successful retry", async () => {
  let fails = false;
  const ui = harness({ previewGoogleCalendarEvents: async () => fails ? fail() : previewed });
  await ui.click("Preview next 14 days");
  expect(ui.html()).toContain("1:30 PM EDT");
  fails = true;
  await ui.click("Preview next 14 days");
  expect(ui.html()).toContain("Calendar preview could not be loaded");
  expect(ui.html()).not.toContain("Verified live at");
  expect(ui.html()).not.toContain("Estimate");
  expect(ui.html()).not.toContain("raw transport secret");
  fails = false;
  await ui.click("Preview next 14 days");
  expect(ui.html()).toContain("1:30 PM EDT");
  expect(ui.html()).not.toContain("could not be loaded");
});

test("a lost calendar-selection response does not claim the write failed or succeeded", async () => {
  const ui = harness({ listGoogleCalendars: async () => listed, selectGoogleCalendar: fail });
  await ui.click("Change calendar");
  await ui.click("Work calendar");
  expect(ui.html()).toContain("Calendar selection could not be confirmed");
  expect(ui.html()).toContain("Reload Settings");
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(0);
});

test("a lost disconnect response requires checking saved state without erasing the view", async () => {
  const ui = harness({ disconnectGoogleCalendarAction: fail });
  await ui.click("Disconnect");
  expect(ui.html()).toContain("Disconnect could not be confirmed");
  expect(ui.html()).toContain("Work calendar");
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(0);
});
