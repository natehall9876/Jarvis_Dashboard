import { test, expect } from "@playwright/test";
import { planHistoricalSync, type HistoricalEvent } from "../src/lib/integrations/homeworks-historical";

// Real payload shapes captured live 2026-09-22 (CLOSED events, June–August history).

const closed = (over: Partial<HistoricalEvent> & { id: string }): HistoricalEvent => ({
  title: "Grass maintenance ",
  status: "CLOSED",
  isDeleted: false,
  startDate: "2026-08-10",
  hasTime: false,
  startTime: null,
  total: "75",
  closedAt: "2026-08-10T15:41:53.000Z",
  budgetedHours: "1",
  lineItems: [{ name: "Grass maintenance", description: "<p>trimming, mowing, blowing debris&nbsp;</p>", budgetedHours: "1" }],
  customer: { fullName: "Jan Sparfven" },
  property: { id: "2714251", address: { street1: "143 Indian Run Trail", city: "Smithfield" } },
  ...over,
});

const plan = (over: Partial<Parameters<typeof planHistoricalSync>[0]> = {}) =>
  planHistoricalSync({ events: [closed({ id: "54831382" })], existingJobHwIds: new Set(), linkedPropertyHwIds: new Set(["2714251"]), existingServiceNames: [], ...over });

test.describe("historical sync planning (real Homeworks payload shapes)", () => {
  test("a CLOSED event for a linked property with no existing job is a create", () => {
    const p = plan();
    expect(p.totals).toMatchObject({ events: 1, wouldCreate: 1, alreadySynced: 0, blocked: 0, other: 0 });
    const row = p.rows[0];
    expect(row.status).toBe("would_create");
    expect(row.resolved).toMatchObject({ serviceName: "Grass maintenance", hours: 1, price: 75, completedAt: "2026-08-10T15:41:53.000Z", startTime: null });
    expect(p.servicesToCreate).toEqual([{ name: "Grass maintenance", description: "trimming, mowing, blowing debris" }]);
  });

  test("an event Jarvis already has a job for is skipped, never re-created or touched", () => {
    const p = plan({ existingJobHwIds: new Set(["54831382"]) });
    expect(p.rows[0].status).toBe("already_synced");
    expect(p.totals.wouldCreate).toBe(0);
  });

  test("a CLOSED event whose property is not linked is blocked, not guessed at", () => {
    const p = plan({ linkedPropertyHwIds: new Set() });
    expect(p.rows[0].status).toBe("blocked_property_not_synced");
  });

  test("an OPEN event is excluded from historical import — it belongs to the active sync instead", () => {
    const p = plan({ events: [closed({ id: "1", status: "OPEN" })] });
    expect(p.rows[0].status).toBe("not_closed");
    expect(p.totals.wouldCreate).toBe(0);
  });

  test("a deleted event is excluded", () => {
    const p = plan({ events: [closed({ id: "1", isDeleted: true })] });
    expect(p.rows[0].status).toBe("deleted");
  });

  test("an all-day historical job never gets an invented start time; a real one is preserved", () => {
    const allDay = plan({ events: [closed({ id: "1", hasTime: false, startTime: null })] });
    expect(allDay.rows[0].resolved.startTime).toBeNull();
    const timed = plan({ events: [closed({ id: "1", hasTime: true, startTime: "09:15:00" })] });
    expect(timed.rows[0].resolved.startTime).toBe("09:15");
  });

  test("hours fall back to the line item sum when the event's own budgetedHours is absent", () => {
    const p = plan({
      events: [closed({ id: "1", budgetedHours: null, lineItems: [{ name: "Grass", description: null, budgetedHours: "0.5" }, { name: "Edging", description: null, budgetedHours: "0.25" }] })],
    });
    expect(p.rows[0].resolved.hours).toBe(0.75);
  });

  test("an existing service name is reused case-insensitively, never duplicated", () => {
    const p = plan({ existingServiceNames: ["GRASS   maintenance"] });
    expect(p.servicesToCreate).toEqual([]);
  });

  test("the same new service across multiple historical events is planned for creation exactly once", () => {
    const events = ["1", "2", "3"].map((id) => closed({ id, property: { id: "2714251", address: { street1: "143 Indian Run Trail", city: "Smithfield" } } }));
    const p = plan({ events });
    expect(p.servicesToCreate).toHaveLength(1);
    expect(p.totals.wouldCreate).toBe(3);
  });

  test("a genuinely missing price (no total) is null, never fabricated as zero or omitted silently", () => {
    const p = plan({ events: [closed({ id: "1", total: null })] });
    expect(p.rows[0].resolved.price).toBeNull();
  });

  test("re-running the plan after the created jobs are added finds nothing left to create (idempotent)", () => {
    const events = [closed({ id: "1" }), closed({ id: "2" })];
    const first = plan({ events });
    expect(first.totals.wouldCreate).toBe(2);
    const createdIds = new Set(first.rows.filter((r) => r.status === "would_create").map((r) => r.hwId));
    const second = plan({ events, existingJobHwIds: createdIds });
    expect(second.totals.wouldCreate).toBe(0);
    expect(second.totals.alreadySynced).toBe(2);
  });

  test("mixed statuses across a real week are classified independently", () => {
    const p = plan({
      events: [
        closed({ id: "1", status: "CLOSED" }),
        closed({ id: "2", status: "OPEN" }),
        closed({ id: "3", status: "CLOSED", isDeleted: true }),
        closed({ id: "4", status: "CLOSED", property: { id: "unlinked", address: null } }),
      ],
    });
    expect(p.totals).toMatchObject({ events: 4, wouldCreate: 1, other: 2, blocked: 1 });
  });
});
