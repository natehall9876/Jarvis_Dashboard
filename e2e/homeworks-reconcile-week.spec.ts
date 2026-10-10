import { test, expect } from "@playwright/test";
import * as dates from "../src/lib/integrations/homeworks-dates";

test.describe("reconciliation business week", () => {
  test("exposes a calendar-week preset distinct from the rolling seven-day range", () => {
    expect(dates).toHaveProperty("currentBusinessWeek");
  });
  for (const [instant, from, to] of [
    ["2026-10-10T03:34:55Z", "2026-10-05", "2026-10-11"],
    ["2026-10-12T03:59:59Z", "2026-10-05", "2026-10-11"],
    ["2026-10-12T04:00:00Z", "2026-10-12", "2026-10-18"],
    ["2026-11-01T06:30:00Z", "2026-10-26", "2026-11-01"],
    ["2026-03-08T07:30:00Z", "2026-03-02", "2026-03-08"],
    ["2027-01-01T17:00:00Z", "2026-12-28", "2027-01-03"],
  ]) {
    test(`Monday–Sunday dates for ${instant}`, () => {
      expect(dates.currentBusinessWeek(new Date(instant))).toEqual({ from, to });
    });
  }
});
