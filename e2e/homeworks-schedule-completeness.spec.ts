import { test, expect } from "@playwright/test";
import { addDaysISO, isISODate, rangeForDays, todayInZone, validateRange } from "../src/lib/integrations/homeworks-dates";
import { fetchAllPages, type PageFetch } from "../src/lib/integrations/homeworks-paging";
import { reconcileDay, type ReconEvent, type ReconJarvisJob } from "../src/lib/integrations/homeworks-reconcile";

// Pure-logic tests: no browser, no network, no database.

test.describe("America/New_York day boundaries (not UTC)", () => {
  test("Monday 9:30 PM Eastern is still Monday even though UTC is already Tuesday", () => {
    expect(todayInZone(new Date("2026-09-22T01:30:00Z"))).toBe("2026-09-21");
  });
  test("the day flips at local midnight (EDT, UTC-4)", () => {
    expect(todayInZone(new Date("2026-09-21T03:59:59.999Z"))).toBe("2026-09-20");
    expect(todayInZone(new Date("2026-09-21T04:00:00.000Z"))).toBe("2026-09-21");
  });
  test("the day flips at local midnight in winter (EST, UTC-5)", () => {
    expect(todayInZone(new Date("2026-12-01T04:59:59.999Z"))).toBe("2026-11-30");
    expect(todayInZone(new Date("2026-12-01T05:00:00.000Z"))).toBe("2026-12-01");
  });
  test("a 7-day range started Monday night still begins on that Monday and includes both ends", () => {
    expect(rangeForDays(7, new Date("2026-09-22T01:30:00Z"))).toEqual({ from: "2026-09-21", to: "2026-09-28" });
  });
  test("calendar-date arithmetic is immune to DST changes", () => {
    expect(addDaysISO("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDaysISO("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysISO("2026-09-21", 7)).toBe("2026-09-28");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
  test("range validation", () => {
    expect(validateRange({ from: "2026-09-21", to: "2026-09-21" }).ok).toBe(true);
    expect(validateRange({ from: "2026-09-22", to: "2026-09-21" }).ok).toBe(false);
    expect(validateRange({ from: "2026-02-30", to: "2026-03-01" }).ok).toBe(false);
    expect(validateRange({ from: "2026-01-01", to: "2026-12-31" }).ok).toBe(false);
    expect(isISODate("2026-09-21")).toBe(true);
    expect(isISODate("9/21/2026")).toBe(false);
  });
});

type Item = { id: string };
const ids = (from: number, count: number): Item[] => Array.from({ length: count }, (_, i) => ({ id: String(from + i) }));

/** A fake API that honours take/skip over a fixed list. */
function fakeApi(all: Item[]): { fetch: PageFetch<Item>; calls: { skip: number; take: number }[] } {
  const calls: { skip: number; take: number }[] = [];
  return {
    calls,
    fetch: async (skip, take) => {
      calls.push({ skip, take });
      return { ok: true, items: all.slice(skip, skip + take) };
    },
  };
}
const noSleep = async () => {};

test.describe("pagination", () => {
  test("fetches every page, not just the first", async () => {
    const api = fakeApi(ids(1, 450));
    const r = await fetchAllPages(api.fetch, { pageSize: 200, sleep: noSleep });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(450);
    expect(r.pages).toBe(3);
    expect(api.calls.map((c) => c.skip)).toEqual([0, 200, 400]);
  });

  test("exactly one full page still asks for the next page", async () => {
    const api = fakeApi(ids(1, 200));
    const r = await fetchAllPages(api.fetch, { pageSize: 200, sleep: noSleep });
    expect(r.ok && r.pages).toBe(2);
    expect(r.ok && r.items.length).toBe(200);
  });

  test("a full page of 25 is never mistaken for the whole result when pageSize is 25", async () => {
    const api = fakeApi(ids(1, 60));
    const r = await fetchAllPages(api.fetch, { pageSize: 25, sleep: noSleep });
    expect(r.ok && r.items.length).toBe(60);
    expect(r.ok && r.pages).toBe(3);
  });

  test("duplicate event IDs across pages are de-duplicated and counted", async () => {
    const pages = [ids(1, 3), [{ id: "3" }, { id: "4" }, { id: "5" }], [{ id: "6" }]];
    const fetch: PageFetch<Item> = async (skip) => ({ ok: true, items: pages[skip / 3] ?? [] });
    const r = await fetchAllPages(fetch, { pageSize: 3, sleep: noSleep });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(r.duplicates).toBe(1);
    expect(r.rawCount).toBe(7);
  });

  test("a server that ignores skip (repeated page) stops with an error instead of looping", async () => {
    const fetch: PageFetch<Item> = async () => ({ ok: true, items: ids(1, 3) });
    const r = await fetchAllPages(fetch, { pageSize: 3, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/repeated|not advancing/);
  });

  test("a page containing only already-seen records stops with an error", async () => {
    const pages = [ids(1, 3), ids(1, 3).reverse()];
    const fetch: PageFetch<Item> = async (skip) => ({ ok: true, items: pages[skip / 3] ?? [] });
    const r = await fetchAllPages(fetch, { pageSize: 3, sleep: noSleep });
    expect(r.ok).toBe(false);
  });

  test("hitting the page cap is an error, never a silently partial 'complete' list", async () => {
    let n = 0;
    const fetch: PageFetch<Item> = async () => ({ ok: true, items: ids((n += 3), 3) });
    const r = await fetchAllPages(fetch, { pageSize: 3, maxPages: 4, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/refusing/);
      expect(r.partial.items.length).toBe(12);
    }
  });

  test("retries a rate limit (429) with backoff and then succeeds", async () => {
    const api = fakeApi(ids(1, 5));
    let failures = 2;
    const sleeps: number[] = [];
    const fetch: PageFetch<Item> = async (skip, take) => (failures-- > 0 ? { ok: false, message: "429", retryable: true } : api.fetch(skip, take));
    const r = await fetchAllPages(fetch, { pageSize: 10, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.ok && r.items.length).toBe(5);
    expect(sleeps).toEqual([500, 1000]);
  });

  test("partial API failure after retries fails the whole fetch and exposes what was fetched", async () => {
    const api = fakeApi(ids(1, 500));
    const fetch: PageFetch<Item> = async (skip, take) => (skip >= 200 ? { ok: false, message: "503", retryable: true } : api.fetch(skip, take));
    const r = await fetchAllPages(fetch, { pageSize: 200, maxRetries: 2, sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("Page 2 failed");
      expect(r.partial.items).toHaveLength(200);
    }
  });

  test("a non-retryable error is not retried", async () => {
    let calls = 0;
    const fetch: PageFetch<Item> = async () => {
      calls++;
      return { ok: false, message: "400 bad query" };
    };
    const r = await fetchAllPages(fetch, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Monday reconciliation (event IDs and customers are the real Monday set)
// ---------------------------------------------------------------------------
const MONDAY = "2026-09-21";
const ev = (id: string, propId: string, customer: string, over: Partial<ReconEvent> = {}): ReconEvent => ({
  id,
  title: "Grass Maintenance",
  status: "OPEN",
  isDeleted: false,
  startDate: MONDAY,
  endDate: null,
  hasTime: false,
  startTime: null,
  customer: { fullName: customer },
  property: { id: propId, address: { street1: "1 Main St", city: "Smithfield" } },
  ...over,
});
const job = (hwId: string | null, over: Partial<ReconJarvisJob> = {}): ReconJarvisJob => ({
  id: `job-${hwId ?? Math.random().toString(36).slice(2)}`,
  homeworks_id: hwId,
  scheduled_date: MONDAY,
  scheduled_start_time: null,
  status: "scheduled",
  clientName: "X",
  propertyLabel: "1 Main St, Smithfield",
  ...over,
});

const mondayEvents: ReconEvent[] = [
  ev("54831397", "2714251", "Jan Sparfven"),
  ev("57158423", "2714259", "Leslie Moreau"),
  ev("57158446", "1866490", "Rob Elliot"),
  ev("57158456", "2714293", "Lizzie Farrell"),
  ev("57158483", "1866486", "Alicia Rathbun"),
  ev("57158499", "2714308", "Frank Sibilia"),
  ev("57158522", "2714312", "Phil Hirons"),
  ev("57158550", "2714315", "Roberts Grandma"),
  ev("57158565", "2714298", "Danny Dumican"),
  ev("57158868", "2715811", "Tara Zelano"),
];

function run(over: { jarvis?: ReconJarvisJob[]; linked?: string[]; lookup?: ReconEvent[]; events?: ReconEvent[] } = {}) {
  const jarvis = over.jarvis ?? mondayEvents.map((e) => job(e.id));
  const byId = new Map(jarvis.filter((j) => j.homeworks_id).map((j) => [j.homeworks_id as string, j]));
  return reconcileDay({
    date: MONDAY,
    hwEvents: over.events ?? mondayEvents,
    jarvisJobsOnDate: jarvis.filter((j) => j.scheduled_date === MONDAY),
    jarvisJobsByHwId: byId,
    linkedPropertyHwIds: new Set(over.linked ?? mondayEvents.map((e) => e.property!.id)),
    hwLookup: new Map((over.lookup ?? []).map((e) => [e.id, e])),
  });
}

test.describe("Monday reconciliation by canonical event ID", () => {
  test("all 10 Homeworks Monday events matching 10 Jarvis jobs is a clean reconciliation", () => {
    const r = run();
    expect(r.totals).toEqual({ homeworks: 10, jarvis: 10, matched: 10, missing: 0, extra: 0 });
  });

  test("a Monday event that was never imported is reported missing with the real reason", () => {
    const jarvis = mondayEvents.filter((e) => e.id !== "57158868").map((e) => job(e.id));
    const r = run({ jarvis });
    expect(r.totals).toMatchObject({ homeworks: 10, jarvis: 9, matched: 9, missing: 1, extra: 0 });
    const missing = r.rows.find((x) => x.state === "missing")!;
    expect(missing.hwId).toBe("57158868");
    expect(missing.customer).toBe("Tara Zelano");
    expect(missing.reason).toMatch(/Not imported yet/);
    expect(missing.localTime).toBe("Unscheduled time (all-day)");
  });

  test("a missing event whose property is not linked is explained as blocked", () => {
    const jarvis = mondayEvents.filter((e) => e.id !== "57158868").map((e) => job(e.id));
    const r = run({ jarvis, linked: mondayEvents.filter((e) => e.id !== "57158868").map((e) => e.property!.id) });
    expect(r.rows.find((x) => x.state === "missing")!.reason).toMatch(/Blocked: no Jarvis property is linked to Homeworks property 2715811/);
  });

  test("non-OPEN and deleted events are explained, not silently dropped", () => {
    const events = [ev("1", "p1", "A", { status: "CLOSED" }), ev("2", "p2", "B", { isDeleted: true }), ev("3", "p3", "C", { status: "WAITLISTED" })];
    const r = run({ events, jarvis: [], linked: ["p1", "p2", "p3"] });
    const reasons = r.rows.map((x) => x.reason);
    expect(reasons[0]).toMatch(/status is CLOSED/);
    expect(reasons[1]).toMatch(/Deleted in Homeworks/);
    expect(reasons[2]).toMatch(/status is WAITLISTED/);
  });

  test("an event Jarvis holds on a different date is missing here with the date mismatch stated", () => {
    const jarvis = mondayEvents.map((e) => (e.id === "57158423" ? job(e.id, { scheduled_date: "2026-09-22" }) : job(e.id)));
    const r = run({ jarvis });
    const row = r.rows.find((x) => x.hwId === "57158423")!;
    expect(row.state).toBe("missing");
    expect(row.reason).toContain("2026-09-22");
  });

  test("Jarvis-only jobs and jobs Homeworks moved elsewhere are reported as extras with reasons", () => {
    const jarvis = [...mondayEvents.map((e) => job(e.id)), job(null), job("999", { scheduled_date: MONDAY })];
    const moved = ev("999", "p9", "Moved", { startDate: "2026-09-28" });
    const r = run({ jarvis, lookup: [moved] });
    expect(r.totals.extra).toBe(2);
    expect(r.rows.find((x) => x.state === "extra" && !x.hwId)!.reason).toMatch(/Jarvis-only/);
    expect(r.rows.find((x) => x.hwId === "999")!.reason).toContain("2026-09-28");
  });

  test("a timed event shows its real local time; all-day shows 'Unscheduled time'", () => {
    const events = [ev("1", "p1", "A", { hasTime: true, startTime: "09:30:00" }), ev("2", "p2", "B")];
    const r = run({ events, jarvis: [], linked: [] });
    expect(r.rows.map((x) => x.localTime)).toEqual(["09:30", "Unscheduled time (all-day)"]);
  });

  test("a multi-day event that started earlier but runs through Monday counts as a Monday job", () => {
    const events = [ev("7", "p7", "Long", { startDate: "2026-09-19", endDate: "2026-09-22" })];
    expect(run({ events, jarvis: [], linked: ["p7"] }).totals.homeworks).toBe(1);
  });
});
