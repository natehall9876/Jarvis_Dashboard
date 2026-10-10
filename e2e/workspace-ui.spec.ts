import { test, expect } from "@playwright/test";

test("workspace commands and reviews reach the shared AI conversation with mobile-safe layout", async ({ page }) => {
  const questions: string[] = [];
  await page.route("**/api/integrations/health", route => route.fulfill({ json: { checkedAt: "2026-10-10T02:00:00Z", services: [
    { id: "ai", name: "Jarvis AI", state: "ready", detail: "Configured, not verified." },
    { id: "quickbooks", name: "QuickBooks", state: "attention", detail: "QuickBooks denied this read (HTTP 403; Intuit code 3100)." },
    { id: "calendar", name: "Google Calendar", state: "setup", detail: "Google app setup is missing." },
  ] } }));
  await page.route("**/api/ai-advisor", async route => {
    questions.push(route.request().postDataJSON().question);
    await route.fulfill({ contentType: "text/event-stream", body: `event: done\ndata: ${JSON.stringify({ answer: "Checked the source records. Review the first invoice.", references: [], toolsUsed: ["get_overdue_invoices"], proposedAction: null })}\n\n` });
  });
  await page.goto("/voice-lab");
  await expect(page.getByText("Ready to ask", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Ask Jarvis from your workspace" }).fill("Who owes me money today?");
  await page.getByRole("button", { name: "Send to Jarvis", exact: true }).click();
  await expect.poll(() => questions.length).toBe(1);
  expect(questions[0]).toBe("Who owes me money today?");
  await expect(page.getByText("Checked the source records. Review the first invoice.").first()).toBeVisible();
  await expect(page.getByText("Verified read", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Review money owed", exact: true }).click();
  await expect.poll(() => questions.length).toBe(2);
  expect(questions[1]).toContain("Do not mark invoices paid or send messages");
  await expect(page.getByText("Review complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("failed connection check stays visible and offers a retry", async ({ page }) => {
  await page.route("**/api/integrations/health", route => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.goto("/voice-lab");
  await expect(page.getByText("Connection checks are unavailable. Retry or open Connections.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recheck", exact: true })).toBeEnabled();
  await expect(page.getByText("Verified read", { exact: true })).toHaveCount(0);
});
