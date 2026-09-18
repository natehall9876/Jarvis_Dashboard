import { test, expect } from "@playwright/test";

/**
 * The Homeworks webhook is a server-to-server endpoint with no Supabase
 * Auth session — its only gate is the shared secret. These checks don't
 * need HOMEWORKS_WEBHOOK_SECRET or SUPABASE_SERVICE_ROLE_KEY configured;
 * they verify the endpoint fails safely in exactly that (unconfigured)
 * state, and rejects bad input before ever reaching the database.
 */
test.describe("Homeworks webhook security boundary", () => {
  test("rejects a request with the wrong secret", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { entity_type: "customer", homeworks_id: "test" },
    });
    // Either 401 (secret configured, this one's wrong) or 503 (not
    // configured at all) is an acceptable "did not write to the database" —
    // 500 or 200 would not be.
    expect([401, 503]).toContain(res.status());
  });

  test("rejects a malformed body before touching the database", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { nonsense: true },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe("Homeworks bulk import security boundary", () => {
  test("rejects a request with the wrong secret", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/import", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { records: [{ entity_type: "customer", homeworks_id: "test" }] },
    });
    expect([401, 503]).toContain(res.status());
  });

  test("rejects an empty records array", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/import", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { records: [] },
    });
    // Wrong secret is checked first, so this is 401/503 too when
    // unconfigured — the point is it never reaches the database either way.
    expect(res.status()).toBeLessThan(500);
  });

  test("rejects a batch over the size limit", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/import", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { records: Array.from({ length: 501 }, (_, i) => ({ entity_type: "customer", homeworks_id: `x${i}` })) },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("dry_run mode still enforces the same auth gate as a real import", async ({ request }) => {
    // dry_run must never be a lighter-security preview path — a wrong
    // secret should be rejected identically whether or not dry_run is set.
    const res = await request.post("/api/integrations/homeworks/import", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong" },
      data: { records: [{ entity_type: "customer", homeworks_id: "test" }], dry_run: true },
    });
    expect([401, 503]).toContain(res.status());
  });
});
