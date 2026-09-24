import { test, expect } from "@playwright/test";
import { loginErrorUrl, safeLoginDestination } from "../src/lib/auth/redirect";

test("login retry preserves the job destination and rejects external redirects", () => {
  const destination = "/jobs/test-job?tab=notes";
  const retry = new URL(loginErrorUrl("Invalid credentials", destination), "https://jarvis.invalid");
  expect(retry.searchParams.get("redirectTo")).toBe(destination);
  for (const value of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\nevil.invalid"]) {
    expect(safeLoginDestination(value)).toBe("/");
  }
});

test("failed login keeps the job link for the next attempt", async ({ page }) => {
  const destination = "/jobs/11111111-1111-1111-1111-111111111111";
  await page.goto(`/login?redirectTo=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email", { exact: true }).fill("nonexistent-test-account@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator('input[name="redirectTo"]')).toHaveValue(destination);
});

test("a lost note-save response preserves the draft and offers recovery", async ({ page }) => {
  // Existing development fixture, never a customer's record. Abort before
  // the request reaches the server: this test performs no database write.
  await page.goto("/voice-lab/jobs/lab-job-1");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New job note").fill("Unsaved regression-test draft");
  await page.route("**/voice-lab/jobs/lab-job-1", async route => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't confirm the save" })).toBeVisible();
  await expect(page.getByLabel("New job note")).toHaveValue("Unsaved regression-test draft");
  await expect(page.getByRole("button", { name: "Save note", exact: true })).toBeEnabled();
});
