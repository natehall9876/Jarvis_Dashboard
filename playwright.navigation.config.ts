import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", testMatch: ["navigation-voice-quality.spec.ts", "voice-lifecycle.spec.ts", "voice-neural.spec.ts", "jarvis-experience.spec.ts"], workers: 1, reporter: "list" });
