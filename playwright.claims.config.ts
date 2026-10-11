import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir:"./e2e", testMatch:["ai-action-claim-retry.spec.ts","ai-homeworks-ownership.spec.ts"], workers:1, retries:0, reporter:"list", timeout:60000 });
