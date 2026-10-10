import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import { createClient } from "@supabase/supabase-js";
import type { ToolSpec } from "../src/lib/ai/tool-types";

test("job details preserve the Homeworks appointment title without exposing the raw source payload", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const requests: URL[] = [];
  const db = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)); requests.push(url);
    return Response.json({ homeworks_id: "90000001", changed_at: "2026-10-10T02:15:00Z", projected_id: id, payload: { title: "Sample Customer — Fall cleanup estimate", description: "Estimate appointment, not billable work", status: "OPEN", total: 0, private_unknown_field: "must not be returned" } });
  } } });
  const { jobTools } = loadServerModule<{ jobTools: ToolSpec[] }>("src/lib/ai/tools/jobs.ts", { "@/lib/supabase/server": { createSupabaseServerClient: async () => db } });
  const tool = jobTools.find(t => t.name === "get_homeworks_job_source");
  expect(tool).toBeDefined();
  const result = await tool!.execute({ job_id: id });
  expect(result.data).toMatchObject({ title: "Sample Customer — Fall cleanup estimate", notes: "Estimate appointment, not billable work", source: "Homeworks" });
  expect(JSON.stringify(result)).not.toContain("must not be returned");
  expect(requests[0].searchParams.get("projected_id")).toBe("eq." + id);
  expect(requests[0].searchParams.get("entity")).toBe("eq.events");
});
