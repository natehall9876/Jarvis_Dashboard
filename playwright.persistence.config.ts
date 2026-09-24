import { defineConfig, devices } from "@playwright/test";

// Separate, explicit opt-in: this suite writes only to an owner-designated
// demo job. Never run against a random record or silently skip missing access.
for (const key of ["E2E_BASE_URL", "E2E_TEST_EMAIL", "E2E_TEST_PASSWORD", "E2E_TEST_JOB_ID", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  if (!process.env[key]) throw new Error(`Persistence verification requires ${key}.`);
}

export default defineConfig({
  testDir: "./e2e-live",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-webkit", use: { ...devices["iPhone 14"] } },
  ],
});
