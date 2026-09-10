import { defineConfig, devices } from "@playwright/test";

/**
 * Deliberately minimal right now: the tests here don't require a signed-in
 * session (no test Supabase credentials exist in this environment — see
 * docs/TESTING.md), so they cover what's verifiable without one: unauthenticated
 * routing/redirect behavior and that the login page itself renders correctly.
 * Authenticated E2E coverage (Command Center, client/property/job drill-down,
 * Jarvis, actions) is the next thing to add once test credentials exist —
 * don't mistake this file for that suite.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
