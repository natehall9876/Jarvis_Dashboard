import { test, expect } from "@playwright/test";

/**
 * Covers what's verifiable without a real Supabase test account (none
 * exists in this environment). See docs/TESTING.md for what authenticated
 * coverage still needs to be added, and why it isn't here yet.
 */

test.describe("unauthenticated routing", () => {
  test("visiting a protected route without a session redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders the real sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Jarvis" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("submitting invalid credentials shows a real error, not a crash", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nonexistent-test-account@example.invalid");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Supabase's real auth error surfaces inline on the login page (see
    // src/app/(auth)/login/actions.ts) — the page must not throw or 500.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert").or(page.locator("text=/invalid|error/i"))).toBeVisible({ timeout: 10_000 });
  });
});
