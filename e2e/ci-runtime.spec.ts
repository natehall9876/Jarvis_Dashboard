import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("CI uses Node 24 to match production and support the locked Supabase packages", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  // Production runs Node 24.x; the locked Supabase packages require Node >=22.
  const versions = [...workflow.matchAll(/^\s*node-version:\s*["']?(\d+)(?:\.x)?["']?\s*$/gm)];
  expect(versions).toHaveLength(1);
  expect(Number(versions[0][1])).toBe(24);
});
