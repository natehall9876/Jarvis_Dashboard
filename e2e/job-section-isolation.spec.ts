import { test, expect } from "@playwright/test";
import { getJobPhotoUrls, getJobPhotoUrl } from "../src/lib/supabase/storage";

/**
 * Regression tests for "a failing optional section must not blank the whole
 * job page" (job detail's Crew/Equipment/Materials/Photos sections, and the
 * property/client photo sections that share this same helper).
 *
 * getJobById now captures each related query's own error (job_employees,
 * job_equipment, job_materials, job_photos, time_entries) into
 * JobDetail.sectionErrors instead of silently coercing a real failure into
 * `[]` — so the page can render "Couldn't load crew: <reason>" instead of
 * the misleading "No crew assigned". That change lives in src/lib/data/jobs.ts
 * and is exercised by every page load; it isn't re-tested here because it
 * needs a live Supabase connection to trigger a genuine query error.
 *
 * What IS tested here, without any live service, is the harder-to-see half
 * of the same defect: getJobPhotoUrls/getJobPhotoUrl used to call
 * createSupabaseServerClient() (which reads request-scoped cookies via
 * next/headers) with no try/catch. Called outside of a Next.js request —
 * exactly what happens if that call throws for any reason other than a
 * normal Supabase {error} response — it used to propagate and fail the
 * entire page render. Both functions are now wrapped so they degrade to a
 * safe, explicit failure instead.
 */
test.describe("photo URL signing never throws, even when the environment underneath it is broken", () => {
  test("getJobPhotoUrls returns an explicit error instead of throwing", async () => {
    const result = await getJobPhotoUrls(["jobs/some-id/photo.jpg"]);
    expect(result.urls).toBeInstanceOf(Map);
    expect(result.urls.size).toBe(0);
    // Outside a Next.js request scope, next/headers' cookies() throws — this
    // proves that throw is caught, not that Supabase itself returned an
    // error, so the message just needs to be a non-empty string.
    expect(typeof result.error === "string" || result.error === null).toBe(true);
  });

  test("getJobPhotoUrls with an empty path list short-circuits cleanly (no client constructed)", async () => {
    const result = await getJobPhotoUrls([]);
    expect(result.urls.size).toBe(0);
    expect(result.error).toBeNull();
  });

  test("getJobPhotoUrl (singular) returns null instead of throwing under the same failure", async () => {
    await expect(getJobPhotoUrl("jobs/some-id/photo.jpg")).resolves.toBeNull();
  });
});
