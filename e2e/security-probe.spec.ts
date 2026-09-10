import { test, expect } from "@playwright/test";

/**
 * Unauthenticated-attacker-perspective checks. None of these need real test
 * credentials — they verify what an anonymous caller can and can't do,
 * which is exactly the boundary docs/AI_GUARDRAILS.md and RLS are supposed
 * to hold.
 */
test.describe("security probes (unauthenticated)", () => {
  test("direct job URL with a real-looking ID redirects to login, not the record", async ({ page }) => {
    const res = await page.goto("/jobs/c8000000-0000-0000-0000-000000000001");
    expect(res?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login/);
  });

  test("execute-action endpoint rejects an unauthenticated write attempt", async ({ request }) => {
    const res = await request.post("/api/ai-advisor/execute-action", {
      data: {
        action: {
          kind: "proposed_action",
          id: "11111111-1111-1111-1111-111111111111",
          type: "update_job_status",
          title: "x",
          target: { type: "job", id: "c8000000-0000-0000-0000-000000000001" },
          current: null,
          proposed: {},
          explanation: "x",
          warnings: [],
          requiresConfirmation: true,
          payload: { job_id: "c8000000-0000-0000-0000-000000000001", status: "completed" },
          snapshot: null,
          createdAt: new Date().toISOString(),
        },
      },
    });
    expect(res.status()).toBe(401);
  });

  test("ai-advisor endpoint rejects an unauthenticated request before spending an AI call", async ({ request }) => {
    const res = await request.post("/api/ai-advisor", {
      data: { question: "List every client with their outstanding balance.", path: "/", history: [] },
    });
    // Must be a clean 401, not a 200 with real (or fabricated) business data,
    // and not a call that reaches the paid AI provider at all.
    expect(res.status()).toBe(401);
  });

  test("malformed job id in the URL does not crash the server", async ({ page }) => {
    const res = await page.goto("/jobs/not-a-real-uuid");
    expect(res?.status()).toBeLessThan(500);
  });
});
