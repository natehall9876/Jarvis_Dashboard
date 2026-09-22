import { test, expect } from "@playwright/test";
import { buildBriefing, greetingForHour, hourInZone, summarizeJobs } from "../src/lib/jarvis/briefing";
import { CAPABILITIES, STATUS_LABEL } from "../src/lib/jarvis/capabilities";
import { NetworkEngine, chooseParticleCount, type Ctx2D } from "../src/lib/jarvis/network-engine";
import { parseNavigationIntent, stripForSpeech, takeSpeakableSentences, toolToCapabilities } from "../src/lib/jarvis/voice-utils";

// Pure-logic tests: no browser, no network, no database.

test.describe("speech text preparation", () => {
  test("markdown is reduced to speakable plain text", () => {
    expect(stripForSpeech("## Today\n- **10 jobs** scheduled\n- See [Rob Elliot](/clients/1)")).toBe("Today\n10 jobs scheduled\nSee Rob Elliot");
    expect(stripForSpeech("Use `code` and ```block``` here")).toBe("Use code and here");
  });

  test("only complete sentences are spoken while text is still streaming", () => {
    const streamed = "You have 10 jobs today. The first is at Indian Run Trail and";
    const a = takeSpeakableSentences(streamed, 0);
    expect(a.sentences).toEqual(["You have 10 jobs today."]);
    const full = streamed + " the last is on Lakeside Drive. Enjoy!";
    const b = takeSpeakableSentences(full, a.nextIndex);
    expect(b.sentences).toEqual(["The first is at Indian Run Trail and the last is on Lakeside Drive."]);
    const c = takeSpeakableSentences(full, b.nextIndex, true);
    expect(c.sentences).toEqual(["Enjoy!"]);
  });

  test("a decimal number does not end a sentence", () => {
    expect(takeSpeakableSentences("That is 1.5 hours of work. Done.", 0, true).sentences).toEqual(["That is 1.5 hours of work.", "Done."]);
  });
});

test.describe("navigation intent", () => {
  test("route commands resolve deterministically without a model", () => {
    expect(parseNavigationIntent("Open my schedule")).toEqual({ kind: "route", target: { label: "the schedule", href: "/schedule" } });
    expect(parseNavigationIntent("show me the routes.")).toMatchObject({ kind: "route", target: { href: "/routes" } });
    expect(parseNavigationIntent("Jarvis, go to invoices")).toMatchObject({ kind: "route", target: { href: "/invoices" } });
    expect(parseNavigationIntent("take me to settings")).toMatchObject({ kind: "route", target: { href: "/settings" } });
  });

  test("pulling up a person is an entity lookup, not a route", () => {
    expect(parseNavigationIntent("Pull up Rob Elliot")).toEqual({ kind: "entity", query: "Rob Elliot" });
    expect(parseNavigationIntent("show me Phil Hirons' property")).toMatchObject({ kind: "entity" });
  });

  test("\"today's jobs\" opens the Schedule (today's real view), not the full unfiltered jobs list", () => {
    expect(parseNavigationIntent("Show me today's jobs")).toEqual({ kind: "route", target: { label: "today's schedule", href: "/schedule" } });
    expect(parseNavigationIntent("show today's schedule")).toMatchObject({ kind: "route", target: { href: "/schedule" } });
    // The generic plural-jobs route still works for anything that isn't "today's".
    expect(parseNavigationIntent("open my jobs")).toMatchObject({ kind: "route", target: { href: "/jobs" } });
  });

  test("\"open the first job\" is its own deterministic intent, not an entity search for the literal phrase", () => {
    expect(parseNavigationIntent("Open the first job")).toEqual({ kind: "first_job" });
    expect(parseNavigationIntent("open my first job")).toEqual({ kind: "first_job" });
    expect(parseNavigationIntent("show me the next job")).toEqual({ kind: "first_job" });
    // Without this intent, "first job" (singular) would fall through to an
    // entity lookup — /\bjobs\b/ (plural) never matches "job" — and get
    // sent to the advisor as a literal, meaningless search string. Locking
    // that regression in directly:
    expect(parseNavigationIntent("open job 42")).not.toEqual({ kind: "first_job" });
  });

  test("ordinary questions are not navigation", () => {
    expect(parseNavigationIntent("What's my schedule today?")).toEqual({ kind: "none" });
    expect(parseNavigationIntent("How many jobs do I have tomorrow")).toEqual({ kind: "none" });
  });

  test("tool names light up the capabilities they actually exercise", () => {
    expect(toolToCapabilities("search_clients")).toEqual(["customers"]);
    expect(toolToCapabilities("get_workload_summary")).toEqual(["schedule", "jobs"]);
    expect(toolToCapabilities("get_overdue_invoices")).toEqual(["finances"]);
    expect(toolToCapabilities("propose_reschedule_job")).toContain("schedule");
    expect(toolToCapabilities("get_open_tasks")).toEqual(["tasks"]);
    expect(toolToCapabilities("propose_add_job_note")).toEqual(["jobs", "tasks"]);
    expect(toolToCapabilities("something_unknown")).toEqual([]);
  });
});

test.describe("briefing uses only real data", () => {
  const job = (over: Partial<Parameters<typeof summarizeJobs>[0][number]> = {}) => ({ status: "scheduled", price: 50, budgeted_hours: null, scheduled_start_time: null, crewCount: 0, ...over });

  test("greeting follows the business-local hour", () => {
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(13)).toBe("Good afternoon");
    expect(greetingForHour(19)).toBe("Good evening");
    // 2026-09-21 21:30 Eastern is 01:30 UTC the next day — still evening, not "early morning".
    expect(hourInZone(new Date("2026-09-22T01:30:00Z"))).toBe(21);
  });

  test("ten Monday jobs with no hours, times, or crew report exactly that — no invented alerts", () => {
    const jobs = Array.from({ length: 10 }, (_, i) => job({ price: 50 + i }));
    const b = buildBriefing({ name: "Nate", hour: 8, jobs });
    expect(b.greeting).toBe("Good morning, Nate.");
    expect(b.headline).toBe("You have 10 jobs scheduled today.");
    expect(b.counts).toMatchObject({ jobs: 10, missingHours: 10, unscheduledTime: 10, unassigned: 10, scheduledRevenue: 545 });
    expect(b.facts.find((f) => f.label === "Budgeted labor")?.value).toBe("No budgeted hours recorded");
    expect(b.facts.find((f) => f.label === "Scheduled revenue")?.value).toContain("not yet earned");
  });

  test("cancelled and skipped jobs are not counted, and real values are", () => {
    const b = buildBriefing({
      hour: 9,
      jobs: [job({ price: 100, budgeted_hours: 2, scheduled_start_time: "09:00:00", crewCount: 1 }), job({ status: "cancelled", price: 999 }), job({ status: "skipped", price: 999 })],
    });
    expect(b.counts).toMatchObject({ jobs: 1, scheduledRevenue: 100, budgetedHours: 2, missingHours: 0, unscheduledTime: 0, unassigned: 0 });
  });

  test("no jobs produces an honest empty briefing with no facts", () => {
    const b = buildBriefing({ hour: 9, jobs: [] });
    expect(b.headline).toBe("You have no jobs scheduled today.");
    expect(b.facts).toEqual([]);
  });
});

test.describe("capability map is honest", () => {
  test("planned capabilities are never linked and never labelled connected", () => {
    for (const c of CAPABILITIES.filter((c) => c.status === "planned")) {
      expect(c.href).toBeNull();
      expect(STATUS_LABEL[c.status]).not.toBe("Connected");
    }
  });

  test("known gaps are stated, not hidden", () => {
    const finances = CAPABILITIES.find((c) => c.id === "finances")!;
    expect(finances.status).toBe("partial");
    expect(finances.detail).toMatch(/QuickBooks is not connected/);
    expect(CAPABILITIES.find((c) => c.id === "routes")!.detail).toMatch(/No travel-time/);
    // Tasks/notes are built but cannot save until the migration is applied — so never "connected" in the static map.
    const tasks = CAPABILITIES.find((c) => c.id === "tasks")!;
    expect(tasks.status).toBe("partial");
    expect(tasks.detail).toMatch(/migration/);
  });

  test("ids are unique", () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length);
  });
});

// ---------------------------------------------------------------------------
// Particle engine lifecycle: one loop, clean stop, clean destroy.
// ---------------------------------------------------------------------------
function fakeCtx() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    setTransform: () => calls.push("setTransform"),
    clearRect: () => calls.push("clearRect"),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    createRadialGradient: () => gradient,
  } as unknown as Ctx2D;
  return { ctx, calls };
}

function fakeScheduler() {
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();
  const cancelled: number[] = [];
  return {
    env: {
      raf: (cb: (t: number) => void) => {
        const id = nextId++;
        pending.set(id, cb);
        return id;
      },
      caf: (id: number) => {
        pending.delete(id);
        cancelled.push(id);
      },
    },
    pending,
    cancelled,
    run(ts: number) {
      const cbs = [...pending.entries()];
      pending.clear();
      for (const [, cb] of cbs) cb(ts);
    },
  };
}

test.describe("particle engine lifecycle", () => {
  test("start() called repeatedly schedules exactly one animation loop", () => {
    const { ctx } = fakeCtx();
    const sched = fakeScheduler();
    const engine = new NetworkEngine(ctx, { particles: 60, env: sched.env });
    engine.resize(400, 300, 1);
    engine.start();
    engine.start();
    engine.start();
    expect(sched.pending.size).toBe(1);
    sched.run(16);
    sched.run(32);
    expect(sched.pending.size).toBe(1);
    expect(engine.running).toBe(true);
  });

  test("stop() cancels the pending frame and no further frames run", () => {
    const { ctx, calls } = fakeCtx();
    const sched = fakeScheduler();
    const engine = new NetworkEngine(ctx, { particles: 60, env: sched.env });
    engine.resize(400, 300, 1);
    engine.start();
    sched.run(16);
    engine.stop();
    expect(engine.running).toBe(false);
    expect(sched.pending.size).toBe(0);
    expect(sched.cancelled.length).toBe(1);
    const before = calls.filter((c) => c === "clearRect").length;
    sched.run(48);
    expect(calls.filter((c) => c === "clearRect").length).toBe(before);
  });

  test("destroy() stops the loop permanently; start() afterwards does nothing", () => {
    const { ctx } = fakeCtx();
    const sched = fakeScheduler();
    const engine = new NetworkEngine(ctx, { particles: 60, env: sched.env });
    engine.resize(400, 300, 1);
    engine.start();
    engine.destroy();
    expect(sched.pending.size).toBe(0);
    engine.start();
    expect(sched.pending.size).toBe(0);
    expect(engine.running).toBe(false);
  });

  test("a state change renders through the engine without scheduling a new loop", () => {
    const { ctx, calls } = fakeCtx();
    const sched = fakeScheduler();
    const engine = new NetworkEngine(ctx, { particles: 60, env: sched.env });
    engine.resize(400, 300, 1);
    engine.setState("processing");
    engine.renderStatic();
    expect(engine.currentState).toBe("processing");
    expect(sched.pending.size).toBe(0);
    expect(calls).toContain("clearRect");
  });

  test("particle count adapts to the device", () => {
    expect(chooseParticleCount({ variant: "orb", width: 1600 })).toBeLessThan(chooseParticleCount({ variant: "hero", width: 390 }));
    expect(chooseParticleCount({ variant: "hero", width: 390 })).toBeLessThan(chooseParticleCount({ variant: "hero", width: 1600 }));
    expect(chooseParticleCount({ variant: "hero", width: 1600, cores: 2, memoryGb: 2, saveData: true })).toBeLessThan(chooseParticleCount({ variant: "hero", width: 1600 }));
  });
});
