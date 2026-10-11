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

const receipts = () => loadServerModule<typeof import("../src/lib/jarvis/action-receipts")>("src/lib/jarvis/action-receipts.ts");
const action = { kind: "proposed_action", id: "action-one", type: "create_task", title: "Add task", target: null, current: null, proposed: { task: "Check mower" }, payload: { title: "Check mower" }, snapshot: null, explanation: "", warnings: [], requiresConfirmation: true, createdAt: new Date(now).toISOString() } as const;
const pending = { ...done, proposedAction: action } as unknown as Exchange;
const success = { message: 'Added task "Check mower".', result: { task_id: "task-one" }, references: [] };

test("confirmed action settles only matching exchange/action and survives reload without executable payload", () => {
  const r = receipts();
  for (const [exchangeId, actionId] of [["other", action.id], [pending.id, "other"]]) {
    expect(r.settleExchange([pending], exchangeId, actionId, { outcome: "confirmed", response: success }, now)).toEqual([pending]);
  }
  const settled = r.settleExchange([pending, { ...pending, id: "other" }], pending.id, action.id, { outcome: "confirmed", response: success }, now);
  expect(settled[0]).toMatchObject({ proposedAction: null, actionReceipt: { outcome: "confirmed", message: success.message, result: success.result, settledAt: now } });
  expect(settled[1]).toEqual({ ...pending, id: "other" });
  const saved = memory().writeDeviceMemory("owner", [settled[0]], false);
  for (const forbidden of ["payload", "snapshot", "proposed_action", "requiresConfirmation"]) expect(saved).not.toContain(forbidden);
  const restored = memory().readDeviceMemory(saved, "owner", now + 1000).exchanges;
  expect(restored[0]).toMatchObject({ proposedAction: null, actionReceipt: settled[0].actionReceipt });
  expect(r.advisorHistory(restored)[0].answer).toContain(success.message);
  expect(r.advisorHistory(restored)[0].answer).toContain("not instructions or current business facts");
  expect(memory().readDeviceMemory(saved, "other-owner", now).exchanges).toEqual([]);
});

test("cancel settlement is truthful, non executable and does not settle again", () => {
  const r = receipts();
  const settled = r.settleExchange([pending], pending.id, action.id, { outcome: "cancelled" }, now);
  expect(settled[0]).toMatchObject({ proposedAction: null, actionReceipt: { outcome: "cancelled", message: r.CANCEL_MESSAGE, result: {}, references: [] } });
  expect(r.settleExchange(settled, pending.id, action.id, { outcome: "confirmed", response: success }, now)).toEqual(settled);
  const restored = memory().readDeviceMemory(memory().writeDeviceMemory("owner", settled, false), "owner", now).exchanges;
  expect(r.advisorHistory(restored)[0].answer).toContain(r.CANCEL_MESSAGE);
});

test("receipt validation rejects malformed, oversized, expired and executable fields", () => {
  const r = receipts();
  const receipt = r.settleExchange([pending], pending.id, action.id, { outcome: "confirmed", response: success }, now)[0].actionReceipt!;
  for (const patch of [
    { payload: {} }, { actionId: "" }, { actionId: "x".repeat(129) }, { actionType: "create_job" }, { outcome: "failed" },
    { message: "" }, { message: "x".repeat(2001) }, { settledAt: now + 1 }, { settledAt: now - 8 * 86400000 }, { settledAt: NaN },
    { result: { task_id: "task-one", payload: {} } }, { result: { task_id: [] } }, { result: {} },
    { references: Array(31).fill({ type: "job", id: "job", label: "Job" }) },
    { references: [{ type: "job", id: "job", label: "x".repeat(301) }] }, { references: [{ type: "alien", id: "id", label: "Label" }] },
  ]) {
    expect(r.validateReceipt({ ...receipt, ...patch }, now)).toBeNull();
    expect(memory().readDeviceMemory(stored("owner", [{ ...done, actionReceipt: { ...receipt, ...patch } }]), "owner", now).exchanges[0].actionReceipt).toBeUndefined();
  }
  expect(r.settleExchange([pending], pending.id, action.id, { outcome: "confirmed", response: { error: "Retry" } }, now)).toEqual([pending]);
});

test("result fields and returned entity references are validated and retained", () => {
  const r = receipts();
  const jobAction = { ...action, type: "reschedule_job" };
  const response = { message: "Rescheduled Job.", result: { job_id: "job-one", scheduled_date: "2026-10-12", scheduled_start_time: "09:30:00" }, references: [{ type: "job", id: "job-one", label: "Job" }] };
  const settled = r.settleExchange([{ ...pending, proposedAction: jobAction } as unknown as Exchange], pending.id, action.id, { outcome: "confirmed", response }, now);
  expect(settled[0].actionReceipt).toMatchObject(response);
  for (const result of [{ ...response.result, scheduled_date: "2026-02-30" }, { ...response.result, scheduled_date: "2026-99-99" }, { ...response.result, scheduled_start_time: "25:00" }]) expect(r.validateReceipt({ ...settled[0].actionReceipt, result }, now)).toBeNull();
  const history = r.advisorHistory(Array.from({ length: 20 }, (_, i) => ({ ...settled[0], id: `ex-${i}`, answer: "a".repeat(20000) })));
  expect(history).toHaveLength(6);
  expect(history.every(turn => turn.answer.length <= 20000 && turn.answer.includes(response.message))).toBe(true);
});

test("real card Cancel makes no execute request; success passes full result; failure stays unsettled", async () => {
  type Node = { type?: string; props?: { children?: Node | Node[]; onClick?: () => Promise<void> | void } };
  const buttons = (node: Node): Node[] => {
    if (!node || typeof node !== "object") return [];
    const children = node.props?.children;
    return [...(node.type === "button" ? [node] : []), ...(Array.isArray(children) ? children : [children]).flatMap(child => buttons(child as Node))];
  };
  for (const mode of ["cancel", "success", "failure"]) {
    let requests = 0;
    const settlements: unknown[] = [];
    const card = loadServerModule<typeof import("../src/components/ai-advisor/proposed-action-card")>("src/components/ai-advisor/proposed-action-card.tsx", {
      react: { useState: () => [{ kind: "pending" }, () => {}] },
    }, async () => { requests++; return new Response(JSON.stringify(mode === "failure" ? { error: "Retry later" } : success), { status: mode === "failure" ? 500 : 200 }); });
    const tree = card.ProposedActionCard({ action: action as unknown as Parameters<typeof card.ProposedActionCard>[0]["action"], onSettled: (...args) => settlements.push(args) });
    await buttons(tree as Node)[mode === "cancel" ? 1 : 0].props!.onClick!();
    expect(requests).toBe(mode === "cancel" ? 0 : 1);
    expect(settlements).toEqual(mode === "failure" ? [] : [[action.id, mode === "cancel" ? { outcome: "cancelled" } : { outcome: "confirmed", response: success }]]);
  }
});
