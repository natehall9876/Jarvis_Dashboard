import { test, expect } from "@playwright/test";
import { isMalformedIdError } from "../src/lib/data/shared";

/**
 * Regression tests for the "can't open jobs" defect: getJobById used
 * .single(), which throws a raw, confusing Postgres/PostgREST message for
 * the ordinary case of a job id that doesn't match any row (stale link,
 * deleted job, malformed id) — and the job page rendered a silent blank
 * page (`return null`) instead of a proper not-found screen, unlike the
 * client and property pages, which already call notFound(). Fixed by
 * switching to maybeSingle(), classifying a malformed-UUID error as
 * "not found" rather than a raw error, and calling notFound() consistently.
 *
 * This suite covers the classification logic in isolation. The full chain —
 * an authenticated visit to a stale job link rendering the shared 404 page —
 * needs a live authenticated session to verify end to end; that is NOT
 * covered here.
 */
test.describe("job-id error classification (real Postgres/PostgREST error text)", () => {
  test("a malformed UUID is classified as not-found, not a raw database error", () => {
    expect(isMalformedIdError('invalid input syntax for type uuid: "abc123"')).toBe(true);
    expect(isMalformedIdError("INVALID INPUT SYNTAX for type uuid")).toBe(true);
  });

  test("a genuine, unrelated database error is never misclassified as not-found", () => {
    expect(isMalformedIdError("permission denied for table jobs")).toBe(false);
    expect(isMalformedIdError("connection refused")).toBe(false);
    expect(isMalformedIdError("relation \"public.jobs\" does not exist")).toBe(false);
  });
});
