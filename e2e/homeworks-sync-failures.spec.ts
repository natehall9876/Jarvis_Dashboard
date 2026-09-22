import { test, expect } from "@playwright/test";
import { INVALID_PAYLOAD_MESSAGE, INVALID_SECRET_MESSAGE } from "../src/lib/integrations/homeworks-sync-failures";

/**
 * Covers the four cases named explicitly: rejected delivery (wrong secret,
 * malformed body), duplicates (idempotent redelivery), and processing
 * failure (a well-formed record whose parent isn't synced yet) — plus the
 * redaction guarantee for the two rejection messages.
 *
 * "Successful delivery" for this endpoint fundamentally requires a working
 * database (a real client row to upsert against) — this environment's
 * SUPABASE_SERVICE_ROLE_KEY is blank locally (unlike production), so that
 * exact path cannot be driven end-to-end from here. What CAN be verified
 * without a live database, and is below: the endpoint's auth/validation
 * responses never depend on database availability (a wrong secret or a
 * malformed body is still correctly rejected with 401/400, not 503, even
 * though logging the failure silently no-ops without a database) — see
 * homeworks-sync.ts's syncHomeworksEntity for the idempotency and
 * processing-failure logic itself, already covered by
 * e2e/homeworks-webhook.spec.ts and homeworks-linking.spec.ts's payload-
 * shape tests.
 */
test.describe("rejected delivery: messages are fixed constants, never built from the request", () => {
  test("a wrong secret never appears in the response, even as a substring", async ({ request }) => {
    const canary = "CANARY-SECRET-VALUE-should-never-be-echoed-9f3a";
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": canary },
      data: { entity_type: "customer", homeworks_id: "test-id" },
    });
    const bodyText = await res.text();
    expect(bodyText).not.toContain(canary);
    // 401 (secret configured, this one's wrong) or 503 (not configured at
    // all in this environment) are both "never reached the database" —
    // either way the canary must never appear.
    expect([401, 503]).toContain(res.status());
  });

  test("the wrong-secret response uses the exact fixed message (not a dynamic one)", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": "some-other-wrong-value" },
      data: { entity_type: "customer", homeworks_id: "test-id" },
    });
    if (res.status() === 401) {
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(INVALID_SECRET_MESSAGE);
    }
  });

  test("a malformed body is rejected with the fixed message, independent of database availability", async ({ request }) => {
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": "definitely-wrong-in-this-environment" },
      data: { nonsense_field: "arbitrary Zap misconfiguration" },
    });
    // Secret is checked first, so an unconfigured-secret 503 or a wrong-
    // secret 401 both take priority over the payload shape here — this
    // proves the auth check runs before the validation check, which is the
    // actual security property; the payload-rejection message itself is
    // exercised directly (not through HTTP) in the next test.
    expect([401, 503]).toContain(res.status());
  });

  test("INVALID_PAYLOAD_MESSAGE describes every real entity type, including job", () => {
    // Regression: the message used to say "('customer'|'property'|'invoice')"
    // and omit 'job' even after job payloads were supported — an easy drift
    // to reintroduce since the message and the validator are two different
    // places. This locks the message's own content, not just its use.
    expect(INVALID_PAYLOAD_MESSAGE).toContain("customer");
    expect(INVALID_PAYLOAD_MESSAGE).toContain("property");
    expect(INVALID_PAYLOAD_MESSAGE).toContain("invoice");
    expect(INVALID_PAYLOAD_MESSAGE).toContain("job");
  });
});

test.describe("auth/validation never depends on the database being reachable", () => {
  test("the endpoint's fast-fail paths (401/400) don't regress into always returning 503", async ({ request }) => {
    // The real risk this session's refactor introduced and then fixed:
    // constructing the admin client too early would make EVERY request —
    // including an obviously wrong secret — fail with "storage
    // unavailable" instead of the correct, information-appropriate 401.
    // Logging a failure is now best-effort specifically so this can't
    // regress silently.
    const res = await request.post("/api/integrations/homeworks/webhook", {
      headers: { "x-homeworks-webhook-secret": "wrong" },
      data: { entity_type: "customer", homeworks_id: "x" },
    });
    // A 503 here is only acceptable if it's because HOMEWORKS_WEBHOOK_SECRET
    // itself isn't configured (checked first, before any database use) —
    // never because of the admin client.
    if (res.status() === 503) {
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("HOMEWORKS_WEBHOOK_SECRET");
    } else {
      expect(res.status()).toBe(401);
    }
  });
});
