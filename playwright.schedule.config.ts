import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./e2e",testMatch:/schedule-authority.spec.ts/,reporter:"list",workers:1});
