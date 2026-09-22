import { test, expect } from "@playwright/test";
import { detectScheduleConflicts, type ConflictJob } from "../src/lib/scheduling/conflicts";
import { DEFAULT_CREW_HOUR_TARGET, targetGapPercent } from "../src/lib/calculations";

const job = (over: Partial<ConflictJob> & { id: string }): ConflictJob => ({
  label: "Job",
  crew: ["Nate"],
  scheduledStartTime: "09:00",
  budgetedHours: 1,
  ...over,
});

test.describe("schedule conflict detection", () => {
  test("two overlapping timed jobs for the same crew member is a conflict", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", scheduledStartTime: "09:00", budgetedHours: 1 }),
      job({ id: "2", scheduledStartTime: "09:30", budgetedHours: 1 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ crewMember: "Nate", jobA: { id: "1", start: "09:00", end: "10:00" }, jobB: { id: "2", start: "09:30", end: "10:30" } });
  });

  test("back-to-back jobs that do not overlap are not a conflict", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", scheduledStartTime: "09:00", budgetedHours: 1 }),
      job({ id: "2", scheduledStartTime: "10:00", budgetedHours: 1 }),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  test("overlapping jobs for two different crew members are not a conflict", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", crew: ["Nate"], scheduledStartTime: "09:00" }),
      job({ id: "2", crew: ["Sam"], scheduledStartTime: "09:00" }),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  test("all-day (untimed) jobs never conflict — there is nothing to overlap", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", scheduledStartTime: null }),
      job({ id: "2", scheduledStartTime: null }),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  test("a timed job with no budgeted hours still conflicts using the conservative 1-hour fallback", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", scheduledStartTime: "09:00", budgetedHours: null }),
      job({ id: "2", scheduledStartTime: "09:30", budgetedHours: null }),
    ]);
    expect(conflicts).toHaveLength(1);
  });

  test("a crew member on both jobs together (two-person crew) is only a conflict when it is a genuine double-booking", () => {
    // Same two people assigned to both jobs simultaneously is a real crew split, not a data error — still flagged per person.
    const conflicts = detectScheduleConflicts([
      job({ id: "1", crew: ["Nate", "Sam"], scheduledStartTime: "09:00", budgetedHours: 1 }),
      job({ id: "2", crew: ["Nate"], scheduledStartTime: "09:00", budgetedHours: 1 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].crewMember).toBe("Nate");
  });

  test("three-way overlap reports every pairwise conflict", () => {
    const conflicts = detectScheduleConflicts([
      job({ id: "1", scheduledStartTime: "09:00", budgetedHours: 2 }),
      job({ id: "2", scheduledStartTime: "09:30", budgetedHours: 2 }),
      job({ id: "3", scheduledStartTime: "10:00", budgetedHours: 2 }),
    ]);
    expect(conflicts).toHaveLength(3);
  });

  test("an empty day and a single job produce no conflicts", () => {
    expect(detectScheduleConflicts([])).toHaveLength(0);
    expect(detectScheduleConflicts([job({ id: "1" })])).toHaveLength(0);
  });
});

test.describe("revenue-per-crew-hour target", () => {
  test("the target is $130/hr by default, a planning benchmark not a guarantee", () => {
    expect(DEFAULT_CREW_HOUR_TARGET).toBe(130);
  });
  test("above and below target are signed correctly", () => {
    expect(targetGapPercent(143)).toBeCloseTo(10, 5);
    expect(targetGapPercent(104)).toBeCloseTo(-20, 5);
    expect(targetGapPercent(130)).toBe(0);
  });
  test("an unknown actual rate produces no comparison rather than a fabricated one", () => {
    expect(targetGapPercent(null)).toBeNull();
  });
  test("the target is configurable per call, not hard-coded", () => {
    expect(targetGapPercent(150, 100)).toBe(50);
  });
});
