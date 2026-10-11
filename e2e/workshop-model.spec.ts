import { test, expect } from "@playwright/test";
import { loadServerModule } from "./load-server-module";
import type { WorkshopDetail, WorkOption } from "../src/lib/jarvis/workshop-model";
const model = () => loadServerModule<typeof import("../src/lib/jarvis/workshop-model")>("src/lib/jarvis/workshop-model.ts");
const snapshot = (overrides = {}) => JSON.stringify({ version: 1, owner: "owner-a", propertyId: "property-a", options: ["quote:q-1"], assumptions: "Verify access on site", savedAt: "2026-10-11T12:00:00Z", view: { yaw: 0, pitch: .12, distance: 5.2 }, ...overrides });
test("Workshop restoration is account-scoped and rejects malformed input", () => {
  const { readWorkshop, workshopKey } = model();
  expect(workshopKey("owner-a")).not.toBe(workshopKey("owner-b"));
  expect(readWorkshop(snapshot(), "owner-a")?.assumptions).toBe("Verify access on site");
  for (const raw of [snapshot(), "null", "{}", "broken"]) expect(readWorkshop(raw, "owner-b")).toBeNull();
  for (const overrides of [{ view: { yaw: 0, pitch: 0, distance: 100 } }, { assumptions: "x".repeat(6001) }, { options: ["javascript:alert(1)"] }, { savedAt: "invalid" }, { propertyId: "../../admin" }]) expect(readWorkshop(snapshot(overrides), "owner-a")).toBeNull();
});
test("Comparison preserves unknown prices and never computes an invented zero", () => {
  const { priceDifference } = model();
  const option = (price: number | null) => ({ price }) as WorkOption;
  expect(priceDifference(option(null), option(100))).toBeNull();
  expect(priceDifference(undefined, option(100))).toBeNull();
  expect(priceDifference(option(0), option(100))).toBe(100);
  expect(priceDifference(option(145), option(100))).toBe(-45);
});
test("Scope comparison uses recorded quote totals and filters deleted sources", () => {
  const detail = { quotes: [{ id: "q1", total: 115, created_at: "2026-10-11", status: "draft", quote_number: "Q1", items: [{ description: "Recorded scope", quantity: 2, unit_price: 50, budgeted_hours: null, is_optional: true }] }, { id: "deleted", homeworks_deleted: true, items: [] }], jobs: [{ id: "j1", service: null, price: null, notes: null, budgeted_hours: null, status: "scheduled", created_at: "2026-10-11" }] } as unknown as WorkshopDetail;
  const options = model().workOptions(detail);
  expect(options).toHaveLength(2); expect(options[0].price).toBe(115); expect(options[0].hours).toBeNull(); expect(options[0].scope[0]).toContain("(optional)"); expect(options[1].price).toBeNull(); expect(options[1].scope).toEqual(["Service scope not recorded"]);
});
test("Pinch detection normalizes to hand size and refuses incomplete hands", () => {
  const { handPose } = model();
  expect(handPose([])).toBeNull();
  const hand = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  hand[9] = { x: .5, y: .3 }; hand[4] = { x: .48, y: .2 }; hand[8] = { x: .5, y: .2 };
  expect(handPose(hand)?.pinched).toBe(true);
  hand[8] = { x: .65, y: .2 }; expect(handPose(hand)?.pinched).toBe(false);
});

test("Workshop review preserves source context and bounds long assumptions to advisor limit", () => {
  const { buildWorkshopReview } = model();
  const result = buildWorkshopReview("property-a", ["quote:q1", "job:j1"], "x".repeat(6000));
  expect(result.prompt.length).toBeLessThanOrEqual(2000); expect(result.truncated).toBe(true);
  expect(result.prompt).toContain("property-a"); expect(result.prompt).toContain("quote:q1 and job:j1"); expect(result.prompt).toContain("Do not invent facts, change records, or send anything"); expect(result.prompt).toContain("Remaining assumptions omitted");
  expect(buildWorkshopReview("property-a", [], "Check access").truncated).toBe(false);
});
test("Core distinguishes real in-flight capability categories from recorded tool calls", () => {
  const { workshopActivityNodes } = model();
  expect(workshopActivityNodes(true, "Thinking through your request", ["finances"], ["get_invoices"])).toEqual([]);
  expect(workshopActivityNodes(true, "Checking invoice records", ["finances"], [])).toEqual([{ id: "capability:finances", label: "Active capability: finances", kind: "capability" }]);
  expect(workshopActivityNodes(false, null, ["finances"], ["get_invoices"])).toEqual([{ id: "tool:get_invoices", label: "Recorded tool: get invoices", kind: "tool" }]);
});
