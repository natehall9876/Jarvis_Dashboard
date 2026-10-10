import { test, expect } from "@playwright/test";
import type { Exchange } from "../src/components/jarvis/jarvis-provider";
import { loadServerModule } from "./load-server-module";
const memory = () => loadServerModule<typeof import("../src/lib/jarvis/device-memory")>("src/lib/jarvis/device-memory.ts");
const now = Date.now();
const done = { id: "one", question: "Check schedule", answer: "Old answer", status: "done", error: null, references: [], toolsUsed: [], proposedAction: { id: "stale-action" }, viaVoice: false, createdAt: now };
const stored = (owner: string, exchanges: unknown[] = [done]) => JSON.stringify({ version: 1, owner, muted: true, exchanges });

test("memory restores completed text but never action confirmation cards", () => {
  const restored = memory().readDeviceMemory(stored("owner"), "owner", now);
  expect(restored.exchanges).toMatchObject([{ answer: "Old answer", proposedAction: null, restored: true }]);
  expect(restored.muted).toBe(true);
});
test("memory rejects another user's data and expired responses", () => {
  expect(memory().readDeviceMemory(stored("someone-else"), "owner", now).exchanges).toEqual([]);
  expect(memory().readDeviceMemory(stored("owner", [{ ...done, createdAt: now - 8 * 86400000 }]), "owner", now).exchanges).toEqual([]);
});
test("memory ignores malformed, cancelled and partial responses", () => {
  for (const raw of ["null", "not json", "[]", stored("owner", [null, {}, { ...done, status: "streaming" }, { ...done, status: "cancelled" }])]) {
    expect(memory().readDeviceMemory(raw, "owner", now).exchanges).toEqual([]);
  }
});

test("stopped requests do not evict the last twenty completed exchanges", () => {
  const exchanges = [
    ...Array.from({ length: 20 }, (_, i) => ({ ...done, id: `cancelled-${i}`, status: "cancelled" })),
    ...Array.from({ length: 20 }, (_, i) => ({ ...done, id: `done-${i}` })),
  ];
  const saved = memory().writeDeviceMemory("owner", exchanges as unknown as Parameters<ReturnType<typeof memory>["writeDeviceMemory"]>[1], false);
  expect(memory().readDeviceMemory(saved, "owner", now + 1000).exchanges).toHaveLength(20);
});

test("a long series of stopped requests preserves completed session context", () => {
  let exchanges: Exchange[] = Array.from({ length: 20 }, (_, i) => ({ ...done, id: `done-${i}`, status: "done", proposedAction: null }));
  for (let i = 0; i < 50; i++) {
    exchanges = memory().retainSessionExchanges([{ ...done, id: `cancelled-${i}`, status: "cancelled", proposedAction: null }, ...exchanges]);
  }
  expect(exchanges.filter(e => e.status === "done")).toHaveLength(20);
  expect(exchanges.length).toBeLessThanOrEqual(40);
});
