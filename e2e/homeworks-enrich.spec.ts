import { test, expect } from "@playwright/test";
import { htmlToText, hoursFromEvent, planEnrichment, serviceFromEvent, type EnrichEvent, type EnrichJob } from "../src/lib/integrations/homeworks-enrich";
import { formatHours } from "../src/lib/format";

// Pure-logic tests using the real Homeworks payload shapes captured 2026-09-21.

const ev = (over: Partial<EnrichEvent> & { id: string }): EnrichEvent => ({
  status: "OPEN",
  isDeleted: false,
  startDate: "2026-09-21",
  hasTime: false,
  startTime: null,
  budgetedHours: "1",
  lineItems: [{ name: "Grass maintenance ", description: "<p>trimming, mowing, blowing debris&nbsp;</p>", budgetedHours: "1" }],
  customer: { fullName: "Jan Sparfven" },
  ...over,
});

const job = (over: Partial<EnrichJob> & { id: string; homeworks_id: string | null }): EnrichJob => ({
  service_id: null,
  service_name: null,
  budgeted_hours: null,
  scheduled_start_time: null,
  scheduled_date: "2026-09-21",
  clientName: "Jan Sparfven",
  propertyLabel: "143 Indian Run Trail, Smithfield",
  ...over,
});

test.describe("Homeworks payload mapping", () => {
  test("the service name is the first line item, trimmed — not the event title", () => {
    const svc = serviceFromEvent(ev({ id: "1" }));
    expect(svc).toEqual({ name: "Grass maintenance", description: "trimming, mowing, blowing debris" });
  });

  test("html descriptions become plain text", () => {
    expect(htmlToText("<p>Cut grass</p>")).toBe("Cut grass");
    expect(htmlToText("<p>a&nbsp;b</p><p>c &amp; d</p>")).toBe("a b\nc & d");
    expect(htmlToText(null)).toBe("");
  });

  test("budgeted hours convert from Homeworks decimal-hour strings", () => {
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: "0.5" }))).toBe(0.5);
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: "1.25" }))).toBe(1.25);
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: "0.75" }))).toBe(0.75);
  });

  test("zero, missing, or junk hours mean 'not provided', falling back to line items", () => {
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: "0", lineItems: [{ name: "x", description: null, budgetedHours: "0" }] }))).toBeNull();
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: null, lineItems: [{ name: "x", description: null, budgetedHours: "0.5" }, { name: "y", description: null, budgetedHours: "1" }] }))).toBe(1.5);
    expect(hoursFromEvent(ev({ id: "1", budgetedHours: "abc", lineItems: [] }))).toBeNull();
    expect(hoursFromEvent({ id: "1", status: "OPEN", startDate: "x", hasTime: false, startTime: null })).toBeNull();
  });

  test("missing hours display as 'Not set', never a dash or a fabricated zero", () => {
    expect(formatHours(null)).toBe("Not set");
    expect(formatHours(undefined)).toBe("Not set");
    expect(formatHours(0.5)).toBe("0.5 hr");
  });
});

test.describe("enrichment planning", () => {
  test("blank Jarvis service and hours are filled from the matching event ID; nothing else changes", () => {
    const plan = planEnrichment({ events: [ev({ id: "54831397" })], jobs: [job({ id: "j1", homeworks_id: "54831397" })], existingServiceNames: [] });
    expect(plan.totals).toMatchObject({ matchedJobs: 1, update: 1, fieldsToFill: 2, notInJarvis: 0 });
    expect(plan.rows[0].changes).toEqual([
      { field: "service", before: null, after: "Grass maintenance" },
      { field: "budgeted_hours", before: null, after: "1 hr" },
    ]);
    expect(plan.servicesToCreate).toEqual([{ name: "Grass maintenance", description: "trimming, mowing, blowing debris" }]);
  });

  test("an all-day event never gets an invented start time", () => {
    const plan = planEnrichment({ events: [ev({ id: "1", hasTime: false, startTime: "09:00:00" })], jobs: [job({ id: "j1", homeworks_id: "1" })], existingServiceNames: [] });
    expect(plan.rows[0].changes.map((c) => c.field)).not.toContain("scheduled_start_time");
  });

  test("a real start time only fills a blank, and never replaces an existing one", () => {
    const timed = ev({ id: "1", hasTime: true, startTime: "09:30:00" });
    const blank = planEnrichment({ events: [timed], jobs: [job({ id: "j1", homeworks_id: "1", service_id: "s", service_name: "Grass maintenance", budgeted_hours: 1 })], existingServiceNames: ["Grass maintenance"] });
    expect(blank.rows[0].changes).toEqual([{ field: "scheduled_start_time", before: null, after: "09:30" }]);
    const set = planEnrichment({ events: [timed], jobs: [job({ id: "j1", homeworks_id: "1", service_id: "s", service_name: "Grass maintenance", budgeted_hours: 1, scheduled_start_time: "13:00:00" })], existingServiceNames: ["Grass maintenance"] });
    expect(set.rows[0].changes).toEqual([]);
    expect(set.rows[0].kept).toEqual([{ field: "scheduled_start_time", jarvis: "13:00", homeworks: "09:30" }]);
  });

  test("manually entered hours and service are preserved, even when Homeworks differs", () => {
    const plan = planEnrichment({
      events: [ev({ id: "1", budgetedHours: "0.5" })],
      jobs: [job({ id: "j1", homeworks_id: "1", service_id: "s9", service_name: "Lawn Mowing", budgeted_hours: 2 })],
      existingServiceNames: ["Lawn Mowing"],
    });
    expect(plan.rows[0].status).toBe("unchanged");
    expect(plan.rows[0].changes).toEqual([]);
    expect(plan.rows[0].kept.map((k) => k.field).sort()).toEqual(["budgeted_hours", "service"]);
    expect(plan.totals.fieldsToFill).toBe(0);
  });

  test("a missing Homeworks value never blanks or changes a Jarvis value", () => {
    const plan = planEnrichment({
      events: [ev({ id: "1", budgetedHours: "0", lineItems: [] })],
      jobs: [job({ id: "j1", homeworks_id: "1", service_id: "s", service_name: "Mowing", budgeted_hours: 1.5 })],
      existingServiceNames: ["Mowing"],
    });
    expect(plan.rows[0].changes).toEqual([]);
    expect(plan.rows[0].kept).toEqual([]);
  });

  test("an existing service is reused case-insensitively — no duplicate service is planned", () => {
    const plan = planEnrichment({ events: [ev({ id: "1" })], jobs: [job({ id: "j1", homeworks_id: "1" })], existingServiceNames: ["GRASS   maintenance"] });
    expect(plan.servicesToCreate).toEqual([]);
    expect(plan.rows[0].newServiceName).toBeNull();
    expect(plan.rows[0].changes.map((c) => c.field)).toContain("service");
  });

  test("the same new service across many jobs is planned for creation once", () => {
    const events = ["1", "2", "3"].map((id) => ev({ id }));
    const jobs = ["1", "2", "3"].map((id) => job({ id: `j${id}`, homeworks_id: id }));
    expect(planEnrichment({ events, jobs, existingServiceNames: [] }).servicesToCreate).toHaveLength(1);
  });

  test("events with no Jarvis job are counted but never turned into rows (enrichment never creates jobs)", () => {
    const plan = planEnrichment({ events: [ev({ id: "1" }), ev({ id: "2" })], jobs: [job({ id: "j1", homeworks_id: "1" })], existingServiceNames: [] });
    expect(plan.rows).toHaveLength(1);
    expect(plan.totals.notInJarvis).toBe(1);
  });

  test("a job with no Homeworks service and no Jarvis service is flagged for review, not guessed", () => {
    const plan = planEnrichment({ events: [ev({ id: "1", lineItems: [], budgetedHours: null })], jobs: [job({ id: "j1", homeworks_id: "1" })], existingServiceNames: [] });
    expect(plan.rows[0].status).toBe("review");
    expect(plan.rows[0].changes).toEqual([]);
  });

  test("a deleted Homeworks event changes nothing and is flagged", () => {
    const plan = planEnrichment({ events: [ev({ id: "1", isDeleted: true })], jobs: [job({ id: "j1", homeworks_id: "1" })], existingServiceNames: [] });
    expect(plan.rows[0]).toMatchObject({ status: "review", changes: [] });
  });

  test("Jarvis job IDs stay stable: rows reference the existing job, matched by event ID as text", () => {
    const plan = planEnrichment({ events: [ev({ id: "57158423" })], jobs: [job({ id: "existing-uuid", homeworks_id: "57158423" })], existingServiceNames: [] });
    expect(plan.rows[0]).toMatchObject({ jobId: "existing-uuid", hwId: "57158423" });
  });

  test("re-running after the fills are applied plans zero updates (idempotent)", () => {
    const events = [ev({ id: "1", budgetedHours: "0.75" }), ev({ id: "2" })];
    let jobs = [job({ id: "j1", homeworks_id: "1" }), job({ id: "j2", homeworks_id: "2" })];
    const services = ["Grass maintenance"];
    const first = planEnrichment({ events, jobs, existingServiceNames: services });
    expect(first.totals.update).toBe(2);
    jobs = jobs.map((j) => {
      const row = first.rows.find((r) => r.jobId === j.id)!;
      return { ...j, service_id: "svc", service_name: row.resolved.serviceName, budgeted_hours: row.resolved.hours };
    });
    const second = planEnrichment({ events, jobs, existingServiceNames: services });
    expect(second.totals).toMatchObject({ update: 0, fieldsToFill: 0, matchedJobs: 2 });
    expect(second.servicesToCreate).toEqual([]);
    expect(jobs).toHaveLength(2); // no job was created
  });
});
