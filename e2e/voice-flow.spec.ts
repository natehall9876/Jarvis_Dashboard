import { test, expect, type Page } from "@playwright/test";

/**
 * SIMULATED voice tests. These drive the app's real JarvisProvider, VoiceDock and
 * advisor client (via the development-only /voice-lab route) with a FAKE
 * SpeechRecognition and a FAKE speechSynthesis injected into the page, and a
 * MOCKED /api/ai-advisor stream. They prove the app's wiring — mic state,
 * transcript -> request, streamed answer, spoken sentences, navigation, and
 * persistence across pages. They do NOT prove that a physical microphone or the
 * browser vendor's speech service works; that needs a real-device check.
 */

type Advisor = { answer: string; references?: { type: string; id: string; label: string }[]; toolsUsed?: string[] };

async function setup(page: Page, advisor: Advisor, options: { noEnd?: boolean } = {}) {
  await page.addInitScript((opts) => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [] as string[];
    class FakeSR {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        w.__sr = this;
      }
      start() {
        w.__srStarts = ((w.__srStarts as number) ?? 0) + 1;
      }
      stop() {
        if (!opts.noEnd) setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.onend?.();
      }
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    }
    w.SpeechRecognition = FakeSR;
    w.webkitSpeechRecognition = FakeSR;
    w.__say = (text: string, final = true) => {
      const sr = w.__sr as FakeSR;
      sr.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: final, 0: { transcript: text } } } });
      if (final) setTimeout(() => sr.onend?.(), 0);
    };
    w.__srError = (code: string) => {
      const sr = w.__sr as FakeSR;
      sr.onerror?.({ error: code });
      sr.onend?.();
    };
    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    w.SpeechSynthesisUtterance = FakeUtterance;
    const synth = {
      speaking: false,
      speak(u: FakeUtterance) {
        if (u.text) (w.__spoken as string[]).push(u.text);
        synth.speaking = true;
        setTimeout(() => {
          synth.speaking = false;
          u.onend?.();
        }, 5);
      },
      cancel() {
        synth.speaking = false;
      },
    };
    try {
      Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    } catch {
      (window as unknown as Record<string, unknown>).speechSynthesis = synth;
    }
  }, options);

  const requests: { question: string; path: string; history: unknown[] }[] = [];
  await page.route("**/api/ai-advisor", async (route) => {
    requests.push(route.request().postDataJSON());
    const done = { answer: advisor.answer, references: advisor.references ?? [], toolsUsed: advisor.toolsUsed ?? [], proposedAction: null };
    const first = advisor.answer.split(/(?<=\.)\s/)[0];
    const body = `event: delta\ndata: ${JSON.stringify({ text: first + " " })}\n\nevent: delta\ndata: ${JSON.stringify({ text: advisor.answer.slice(first.length + 1) })}\n\nevent: done\ndata: ${JSON.stringify(done)}\n\n`;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
  return requests;
}

const say = (page: Page, text: string, final = true) => page.evaluate(([t, f]) => (window as unknown as { __say: (a: string, b: boolean) => void }).__say(t as string, f as boolean), [text, final]);
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const mounts = (page: Page) => page.evaluate(() => (window as unknown as { __labMounts?: number }).__labMounts ?? 0);
// Scoped to the dock: the page also has a hero "Talk to Jarvis" button, and the dock mic is labelled "Open Jarvis" until its client-side capability check finishes.
const mic = (page: Page) => page.getByLabel("Jarvis voice").getByRole("button", { name: /Talk to Jarvis|Stop listening|Stop speaking/ });

test.describe("voice flow (simulated microphone)", () => {
  test("tapping the mic listens, shows interim text, submits the final transcript with page context, shows and speaks the answer", async ({ page }) => {
    const requests = await setup(page, { answer: "You have 10 jobs today. The first is Jan Sparfven.", toolsUsed: ["get_today_snapshot"] });
    await page.goto("/voice-lab");
    await mic(page).click();
    await expect(page.getByLabel("Jarvis voice")).toContainText("Listening");
    await say(page, "what's my sched", false);
    await expect(page.getByLabel("Jarvis voice")).toContainText("what's my sched");
    await say(page, "What's my schedule today?");
    await expect(page.getByTestId("jarvis-bubble-answer")).toContainText("You have 10 jobs today.");
    expect(requests).toHaveLength(1);
    expect(requests[0].question).toBe("What's my schedule today?");
    expect(requests[0].path).toBe("/voice-lab");
    await expect.poll(() => spoken(page)).toEqual(["You have 10 jobs today.", "The first is Jan Sparfven."]);
  });

  test("a typed question is answered but not spoken", async ({ page }) => {
    const requests = await setup(page, { answer: "Six jobs tomorrow." });
    await page.goto("/voice-lab");
    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    await page.getByLabel("Ask Jarvis a question").fill("How many jobs tomorrow?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText("Six jobs tomorrow.").first()).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(await spoken(page)).toEqual([]);
  });

  test("muting spoken replies keeps the text answer but says nothing", async ({ page }) => {
    await setup(page, { answer: "Ten jobs today." });
    await page.goto("/voice-lab");
    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    await page.getByRole("button", { name: /Spoken replies on/ }).click();
    await mic(page).click();
    await say(page, "schedule count please");
    await expect(page.getByText("Ten jobs today.").first()).toBeVisible();
    expect(await spoken(page)).toEqual([]);
  });

  test("'open my schedule' navigates without calling the advisor, and the session survives the page change", async ({ page }) => {
    const requests = await setup(page, { answer: "unused" });
    await page.goto("/voice-lab");
    await expect.poll(() => mounts(page)).toBeGreaterThan(0);
    await page.waitForTimeout(300); // let dev StrictMode's second mount pass settle
    const mountsBefore = await mounts(page);
    await mic(page).click();
    await say(page, "Open my schedule");
    await expect(page).toHaveURL(/\/voice-lab\/schedule$/);
    await expect(page.getByTestId("lab-main")).toContainText("Lab schedule page");
    expect(requests).toHaveLength(0);
    await expect(page.getByTestId("jarvis-bubble-answer")).toContainText("Opening the schedule.");
    // The layout (and the provider inside it) was never remounted.
    expect(await mounts(page)).toBe(mountsBefore);
  });

  test("'open the first job' resolves against real data (not the advisor) and fails honestly with no session, never crashing", async ({ page }) => {
    // getFirstJobToday() is the REAL server action — not mocked — so in this
    // signed-out lab environment it genuinely returns "You must be signed
    // in", the same way it would for any unauthenticated caller in
    // production. This proves the wiring end-to-end: no advisor call, no
    // navigation on failure, no fabricated job, no crash — the honest
    // failure case a real user with an expired session would also see.
    const requests = await setup(page, { answer: "unused" });
    await page.goto("/voice-lab");
    await expect.poll(() => mounts(page)).toBeGreaterThan(0);
    await mic(page).click();
    await say(page, "Open the first job");
    await expect(page.getByTestId("jarvis-bubble")).toContainText("You must be signed in");
    expect(requests).toHaveLength(0);
    // No navigation happened — still on the lab home page.
    await expect(page).toHaveURL(/\/voice-lab$/);
  });

  test("'pull up' a person navigates to their record only when exactly one match comes back", async ({ page }) => {
    const requests = await setup(page, { answer: "Here is Jan Sparfven's job.", references: [{ type: "job", id: "lab-job-1", label: "Jan Sparfven" }] });
    await page.goto("/voice-lab");
    await expect.poll(() => mounts(page)).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    const mountsBefore = await mounts(page);
    await mic(page).click();
    await say(page, "Pull up Jan Sparfven");
    await expect(page).toHaveURL(/\/voice-lab\/jobs\/lab-job-1$/);
    // lab-job-1 renders the real JobDetailView (see voice-lab/jobs/[id]/page.tsx)
    // with fixture data — this checks real page content actually rendered,
    // not a placeholder string.
    await expect(page.getByTestId("lab-main")).toContainText("Lawn Maintenance");
    expect(requests).toHaveLength(1);
    expect(await mounts(page)).toBe(mountsBefore);
    // The same conversation is still there after navigating.
    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    await expect(page.getByText("Pull up Jan Sparfven").first()).toBeVisible();
  });

  test("an ambiguous match does not navigate anywhere", async ({ page }) => {
    await setup(page, {
      answer: "I found two Richards.",
      references: [
        { type: "client", id: "c1", label: "Richard Martin" },
        { type: "client", id: "c2", label: "Richard Carbone" },
      ],
    });
    await page.goto("/voice-lab");
    await mic(page).click();
    await say(page, "Pull up Richard");
    await expect(page.getByTestId("jarvis-bubble-answer")).toContainText("two Richards");
    await expect(page).toHaveURL(/\/voice-lab$/);
  });

  test("a blocked microphone shows an actionable message in the dock", async ({ page }) => {
    await setup(page, { answer: "x" });
    await page.goto("/voice-lab");
    await mic(page).click();
    await page.evaluate(() => (window as unknown as { __srError: (c: string) => void }).__srError("not-allowed"));
    await expect(page.getByTestId("jarvis-voice-error")).toContainText("Microphone access is blocked");
  });

  test("a recognizer that never reports 'end' cannot leave the mic stuck", async ({ page }) => {
    await setup(page, { answer: "x" }, { noEnd: true });
    await page.goto("/voice-lab");
    await mic(page).click();
    await expect(page.getByLabel("Jarvis voice")).toContainText("Listening");
    await mic(page).click(); // stop
    await expect(page.getByLabel("Jarvis voice")).not.toContainText("Listening", { timeout: 4000 });
    await mic(page).click(); // can listen again
    await expect(page.getByLabel("Jarvis voice")).toContainText("Listening");
  });

  test("the conversation is restored after a full page reload", async ({ page }) => {
    await setup(page, { answer: "Ten jobs today." });
    await page.goto("/voice-lab");
    await mic(page).click();
    await say(page, "How many jobs today");
    await expect(page.getByTestId("jarvis-bubble-answer")).toContainText("Ten jobs today.");
    await page.reload();
    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    await expect(page.getByText("How many jobs today").first()).toBeVisible();
  });

  test("the dock is fully on-screen with a touch-sized mic button", async ({ page }) => {
    await setup(page, { answer: "x" });
    await page.goto("/voice-lab");
    const box = await mic(page).boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  });

  test("voice diagnostics reports real capability flags and keeps the last error after it's dismissed", async ({ page }) => {
    await setup(page, { answer: "x" });
    await page.goto("/voice-lab");

    // Baseline, with the conversation panel open (the floating error banner is
    // deliberately suppressed while the panel is open — no point double-showing
    // the same thing — so this checks capability flags only, before any error).
    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    const diagnostics = page.getByTestId("voice-diagnostics");
    await diagnostics.locator("summary").click();
    // The fake SpeechRecognition/speechSynthesis from setup() are real globals
    // by the time JarvisProvider's capability-detection effect runs, so these
    // reflect the same detection logic a real browser's capabilities would.
    await expect(diagnostics).toContainText("Voice input (speech-to-text)Supported in this browser");
    await expect(diagnostics).toContainText("Spoken replies (text-to-speech)Supported in this browser");
    await expect(diagnostics).toContainText("Last voice errorNone recorded this session");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // With the panel closed, the same error now surfaces as the floating
    // banner. Dismissing that banner must not erase the diagnostics record.
    await mic(page).click();
    await page.evaluate(() => (window as unknown as { __srError: (c: string) => void }).__srError("not-allowed"));
    await expect(page.getByTestId("jarvis-voice-error")).toContainText("Microphone access is blocked");
    await page.getByTestId("jarvis-voice-error").getByLabel("Dismiss").click();
    await expect(page.getByTestId("jarvis-voice-error")).not.toBeVisible();

    await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
    await diagnostics.locator("summary").click();
    await expect(diagnostics).toContainText("Microphone access is blocked");
    await expect(diagnostics).not.toContainText("None recorded this session");
  });
});
