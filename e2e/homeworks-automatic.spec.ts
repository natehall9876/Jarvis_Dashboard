import { test, expect } from "@playwright/test";
import { fetchSourcePage, processStream, type Stream, type Cursor } from "../src/lib/integrations/homeworks-auto-core";
const stream: Stream = { key: "customers_active", entity: "customers", filterType: "CustomerFilter", fields: "id firstName updatedAt", where: { isDeleted: false }, incremental: true };
const cursor: Cursor = { after: 40, since: "2026-10-06T13:00:00Z", startedAt: "2026-10-06T14:00:00Z", full: false };
test("incremental reads use source timestamps and a stable ID cursor without offsets", async () => {
  let sent: Record<string, unknown> = {};
  const rows = await fetchSourcePage(stream, cursor, "test-access", async (_url, init) => { sent = JSON.parse(String(init?.body)); expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access"); return Response.json({ data: { customers: [{ id: 41, firstName: "Changed" }] } }); });
  expect(sent.variables).toEqual({ where: { isDeleted: false, id: { gt: 40 }, updatedAt: { gte: cursor.since } }, take: 100 });
  expect(String(sent.query)).not.toContain("skip:"); expect(rows[0].firstName).toBe("Changed");
});
test("a failed database page never advances the checkpoint or marks success", async () => {
  let completed = false;
  await expect(processStream({ stream, cursor, token: "test", request: async () => Response.json({ data: { customers: [{ id: 41 }] } }), apply: async () => { throw new Error("database unavailable"); }, complete: async () => { completed = true; }, shouldContinue: () => true })).rejects.toThrow("database unavailable");
  expect(completed).toBe(false);
});
test("duplicates or out-of-order source IDs cannot be mistaken for a complete page", async () => {
  await expect(fetchSourcePage(stream, cursor, "test", async () => Response.json({ data: { customers: [{ id: 41 }, { id: 41 }] } }))).rejects.toThrow(/order|duplicate/i);
});
test("GraphQL partial data never reaches the database", async () => {
  let applied = false;
  await expect(processStream({ stream, cursor, token: "test", request: async () => Response.json({ data: { customers: [{ id: 41 }] }, errors: [{ message: "permission" }] }), apply: async () => { applied = true; }, complete: async () => {}, shouldContinue: () => true })).rejects.toThrow(/GraphQL/i);
  expect(applied).toBe(false);
});
test("a short final page is persisted before the successful watermark", async () => {
  const operations: string[] = [];
  const done = await processStream({ stream, cursor, token: "test", request: async () => Response.json({ data: { customers: [{ id: 41 }] } }), apply: async (_rows, after) => { operations.push(`apply:${after}`); }, complete: async () => { operations.push("complete"); }, shouldContinue: () => true });
  expect(done).toBe(true); expect(operations).toEqual(["apply:41", "complete"]);
});
test("time budget exhaustion preserves the cursor and never reports completion", async () => {
  let completed = false;
  const done = await processStream({ stream, cursor, token: "test", request: async () => { throw new Error("must not fetch"); }, apply: async () => {}, complete: async () => { completed = true; }, shouldContinue: () => false });
  expect(done).toBe(false); expect(completed).toBe(false);
});

test("a rate-limited source read retries before persisting data", async () => {
  let calls=0;
  const rows=await fetchSourcePage(stream,cursor,"test",async()=>++calls===1?new Response(null,{status:429}):Response.json({data:{customers:[{id:41}]}}));
  expect(calls).toBe(2); expect(rows).toHaveLength(1);
});
test("a full reconciliation does not invent an incremental filter for properties",async()=>{
 let sent: Record<string,unknown>={};
 await fetchSourcePage({...stream,incremental:false},cursor,"test",async(_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({data:{customers:[]}});});
 expect(sent.variables).toEqual({where:{isDeleted:false,id:{gt:40}},take:100});
});
