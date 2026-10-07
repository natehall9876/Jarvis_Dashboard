import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.types";
import { loadServerModule } from "./load-server-module";

const sync = loadServerModule<typeof import("../src/lib/integrations/homeworks-sync")>("src/lib/integrations/homeworks-sync.ts");

for (const payload of [
  { entity_type: "customer", homeworks_id: "customer-1", first_name: "Injected" },
  { entity_type: "property", homeworks_id: "property-1", customer_homeworks_id: "customer-1", street: "Injected" },
  { entity_type: "invoice", homeworks_id: "invoice-1", customer_homeworks_id: "customer-1", total: 500, status: "paid" },
  { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_date: "2026-10-07", status: "completed" },
] as const) {
  for (const origin of ["webhook", "bulk_import"] as const) {
    test(`retired ${origin} sink rejects ${payload.entity_type} without database access`, async () => {
      let accesses = 0;
      const client = new Proxy({}, { get() { accesses++; throw new Error("Database must not be accessed"); } }) as SupabaseClient<Database>;
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(sync.syncHomeworksEntity(client, payload, origin)).resolves.toEqual({ ok: false, error: sync.LEGACY_HOMEWORKS_WRITE_DISABLED });
      }
      expect(accesses).toBe(0);
    });
  }
}

for (const [name, payload] of [
  ["invalid date", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_date: "2026-02-30" }],
  ["invalid time", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_start_time: "29:90" }],
  ["negative price", { entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", price: -1 }],
  ["invalid status", { entity_type: "invoice", homeworks_id: "inv-1", customer_homeworks_id: "customer-1", status: "nonsense" }],
  ["invalid numeric value", { entity_type: "invoice", homeworks_id: "inv-1", customer_homeworks_id: "customer-1", amount_paid: "paid" }],
  ["invalid string", { entity_type: "customer", homeworks_id: "customer-1", phone: { nested: true } }],
] as const) {
  test("legacy inspection validator rejects " + name, () => {
    expect(sync.isValidHomeworksSyncPayload(payload)).toBe(false);
  });
}

for (const time of ["9:30", "09:30", "23:59:59"]) {
  test("legacy inspection validator accepts real time syntax: " + time, () => {
    expect(sync.isValidHomeworksSyncPayload({ entity_type: "job", homeworks_id: "job-1", property_homeworks_id: "property-1", scheduled_start_time: time })).toBe(true);
  });
}

for (const [file, name, args] of [
  ["homeworks-import", "confirmHomeworksImport", []],
  ["homeworks-job-sync", "confirmHomeworksJobImport", [{ from: "2026-10-07", to: "2026-10-07" }]],
  ["homeworks-link", "confirmHomeworksLinks", [{ customerIds: ["customer-1"], propertyIds: ["property-1"] }]],
  ["homeworks-enrich", "confirmHomeworksEnrichment", [{ from: "2026-10-07", to: "2026-10-07" }]],
  ["homeworks-historical", "confirmHistoricalSync", [{ from: "2026-01-01", to: "2026-10-07" }]],
] as const) {
  test(`${name} rejects stale callers before source reads or database access`, async () => {
    const calls: string[] = [];
    const forbidden = (name: string) => async () => { calls.push(name); throw new Error(name + " must not run"); };
    const actions = loadServerModule<Record<string, (...args: unknown[]) => Promise<unknown>>>(`src/lib/actions/${file}.ts`, {
      "@/lib/supabase/server": { createSupabaseServerClient: forbidden("database") },
      "@/lib/integrations/homeworks-api": { getAllCustomers: forbidden("customers"), getEventsInRange: forbidden("events") },
      "next/cache": { revalidatePath: forbidden("revalidate") },
    }, forbidden("network"));
    await expect(actions[name](...args)).resolves.toEqual({ ok: false, message: sync.LEGACY_HOMEWORKS_WRITE_DISABLED });
    expect(calls).toEqual([]);
  });
}
