import { defineConfig } from "@playwright/test";

/** Pure module tests: no development server, browser install, or credentials. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["ai-provider-recovery.spec.ts", "ai-request-control.spec.ts", "jarvis-memory.spec.ts"],
  fullyParallel: true,
  reporter: "list",
});
