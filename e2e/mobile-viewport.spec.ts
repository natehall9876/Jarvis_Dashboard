import { test, expect } from "@playwright/test";
import type { Viewport } from "next";
import { loadServerModule } from "./load-server-module";

test("root viewport preserves the browser's ability to zoom text to at least 200%", () => {
  // Fonts and CSS are build-time boundaries; inspect the real exported viewport.
  const { viewport } = loadServerModule<{ viewport: Viewport }>("src/app/layout.tsx", {
    "next/font/google": { Geist: () => ({ variable: "" }), Geist_Mono: () => ({ variable: "" }) },
    "@/components/auth/recovery-redirect": { RecoveryRedirect: () => null },
    "./globals.css": {},
  });
  expect(viewport.width).toBe("device-width");
  expect(viewport.initialScale).toBe(1);
  expect(viewport.userScalable).not.toBe(false);
  expect(viewport.maximumScale ?? Infinity).toBeGreaterThanOrEqual(2);
});
