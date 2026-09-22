import { test, expect } from "@playwright/test";
import { datesInRange } from "../src/lib/integrations/homeworks-dates";
import { reconcileRange, type ReconEvent, type ReconJarvisJob } from "../src/lib/integrations/homeworks-reconcile";

// Pure-logic tests: no browser, no network, no database. Generalizes the
// existing single-day reconciliation (see homeworks-schedule-completeness.spec.ts's
// "Monday reconciliation" suite, which this reuses the exact same
// reconcileDay logic underneath) to an arbitrary range.

test.describe("datesInRange", () => {
  test("a single-day range returns exactly that day", () => {
    expect(datesInRange({ from: "2026-09-21", to: "2026-09-21" })).toEqual(["2026-09-21"]);
  });
  test("a multi-day range is inclusive of both ends", () => {
    expect(datesInRange({ from: "2026-09-21", to: "2026-09-23" })).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
  });
  test("crosses a month boundary correctly", () => {
    expect(datesInRange({ from: "2026-09-29", to: "2026-10-01" })).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});

const ev = (id: string, date: string, over: Partial<ReconEvent> = {}): ReconEvent => ({
  id,
  title: "Grass Maintenance",
  status: "OPEN",
  isDeleted: false,
  startDate: date,
  endDate: null,
  hasTime: false,
  startTime: null,
  customer: { fullName: `Customer ${id}` },
  property: { id: `p${id}`, address: { street1: "1 Main St", city: "Smithfield" } },
  ...over,
});
const job = (hwId: string, date: string, over: Partial<ReconJarvisJob> = {}): ReconJarvisJob => ({
  id: `job-${hwId}`,
  homeworks_id: hwId,
  scheduled_date: date,
  scheduled_start_time: null,
  status: "scheduled",
  clientName: `Customer ${hwId}`,
  propertyLabel: "1 Main St, Smithfield",
  ...over,
});

test.describe("reconcileRange", () => {
  test("aggregates matches across multiple days, each contributing to its own day", () => {
    const dates = ["2026-09-21", "2026-09-22", "2026-09-23"];
    const events = [ev("1", "2026-09-21"), ev("2", "2026-09-22"), ev("3", "2026-09-23")];
    const jarvis = [job("1", "2026-09-21"), job("2", "2026-09-22"), job("3", "2026-09-23")];
    const r = reconcileRange({
      from: "2026-09-21",
      to: "2026-09-23",
      dates,
      hwEvents: events,
      jarvisJobs: jarvis,
      linkedPropertyHwIds: new Set(["p1", "p2", "p3"]),
      hwLookup: new Map(),
    });
    expect(r.totals).toEqual({ homeworks: 3, jarvis: 3, matched: 3, missing: 0, extra: 0 });
    expect(r.days).toHaveLength(3);
    expect(r.days.map((d) => d.date)).toEqual(dates);
    expect(r.uniqueHomeworksEvents).toBe(3);
  });

  test("a missing event on day 2 is attributed to day 2, not day 1 or 3", () => {
    const dates = ["2026-09-21", "2026-09-22", "2026-09-23"];
    const events = [ev("1", "2026-09-21"), ev("2", "2026-09-22"), ev("3", "2026-09-23")];
    const jarvis = [job("1", "2026-09-21"), job("3", "2026-09-23")]; // event 2 never imported
    const r = reconcileRange({
      from: "2026-09-21",
      to: "2026-09-23",
      dates,
      hwEvents: events,
      jarvisJobs: jarvis,
      linkedPropertyHwIds: new Set(["p1", "p2", "p3"]),
      hwLookup: new Map(),
    });
    expect(r.totals).toMatchObject({ matched: 2, missing: 1 });
    expect(r.days[0].totals.missing).toBe(0);
    expect(r.days[1].totals.missing).toBe(1);
    expect(r.days[1].rows[0].hwId).toBe("2");
    expect(r.days[2].totals.missing).toBe(0);
  });

  test("a multi-day event counts once in uniqueHomeworksEvents but once per spanned day in totals.homeworks", () => {
    const dates = ["2026-09-21", "2026-09-22", "2026-09-23"];
    // Spans all three days (starts the 21st, ends the 23rd).
    const spanning = ev("1", "2026-09-21", { endDate: "2026-09-23" });
    const jarvis = [job("1", "2026-09-21")];
    const r = reconcileRange({
      from: "2026-09-21",
      to: "2026-09-23",
      dates,
      hwEvents: [spanning],
      jarvisJobs: jarvis,
      linkedPropertyHwIds: new Set(["p1"]),
      hwLookup: new Map(),
    });
    expect(r.uniqueHomeworksEvents).toBe(1);
    expect(r.totals.homeworks).toBe(3); // counted on each of the 3 days it spans, same as the daily schedule view would show it
  });

  test("a Jarvis-only job (no Homeworks id) anywhere in the range is an extra on its own date", () => {
    const dates = ["2026-09-21", "2026-09-22"];
    const jarvis = [job("nonexistent", "2026-09-21", { id: "manual-job", homeworks_id: null })];
    const r = reconcileRange({
      from: "2026-09-21",
      to: "2026-09-22",
      dates,
      hwEvents: [],
      jarvisJobs: jarvis,
      linkedPropertyHwIds: new Set(),
      hwLookup: new Map(),
    });
    expect(r.totals.extra).toBe(1);
    expect(r.days[0].rows[0].reason).toMatch(/Jarvis-only/);
    expect(r.days[1].totals.extra).toBe(0);
  });

  test("an empty range (no Homeworks events, no Jarvis jobs) reconciles cleanly to all zeros", () => {
    const r = reconcileRange({
      from: "2026-09-21",
      to: "2026-09-21",
      dates: ["2026-09-21"],
      hwEvents: [],
      jarvisJobs: [],
      linkedPropertyHwIds: new Set(),
      hwLookup: new Map(),
    });
    expect(r.totals).toEqual({ homeworks: 0, jarvis: 0, matched: 0, missing: 0, extra: 0 });
    expect(r.uniqueHomeworksEvents).toBe(0);
  });
});
