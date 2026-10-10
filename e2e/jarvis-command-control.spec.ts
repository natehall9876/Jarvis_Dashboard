import { test, expect } from "@playwright/test";

test("stopping a response unlocks the next command and ignores the late answer", async ({ page }) => {
  let release: () => void = () => {};
  await page.route("**/api/ai-advisor", async route => {
    const q = route.request().postDataJSON().question;
    if (q === "First question") await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ contentType: "text/event-stream", body: `event: done\ndata: ${JSON.stringify({ answer: q === "First question" ? "LATE ANSWER" : "Second answer", references: [], toolsUsed: [], proposedAction: null })}\n\n` }).catch(() => {});
  });
  await page.goto("/voice-lab");
  await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
  const input = page.getByRole("textbox", { name: "Ask Jarvis a question" });
  await input.fill("First question");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop response", exact: true }).last()).toBeEnabled();
  await page.getByRole("button", { name: "Stop response", exact: true }).last().click();
  await expect(page.getByText("Response stopped.", { exact: true })).toBeVisible();
  await input.fill("Second question");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Second answer", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("LATE ANSWER", { exact: true })).toHaveCount(0);
});

test("completed conversation survives a new tab and clear forgets it", async ({ page, context }) => {
  await page.route("**/api/ai-advisor", route => route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"answer":"Saved answer","references":[],"toolsUsed":[],"proposedAction":null}\n\n' }));
  await page.goto("/voice-lab");
  await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
  await page.getByRole("textbox", { name: "Ask Jarvis a question" }).fill("Remember the context");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Saved answer", { exact: true })).toBeVisible();
  const next = await context.newPage();
  await next.goto("/voice-lab");
  await next.getByRole("button", { name: "Open Jarvis conversation" }).click();
  await expect(next.getByText("Saved answer", { exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: "Open Jarvis conversation" }).isVisible()) await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
  await expect(page.getByText("Saved answer", { exact: true })).toBeVisible();
  await next.getByRole("button", { name: "Clear conversation", exact: true }).click();
  await expect(page.getByText("Saved answer", { exact: true })).toHaveCount(0);
  await next.reload();
  await next.getByRole("button", { name: "Open Jarvis conversation" }).click();
  await expect(next.getByText("Saved answer", { exact: true })).toHaveCount(0);
});


test("the command console fits the viewport and supports reduced motion", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/voice-lab");
  const hero = page.getByRole("region", { name: "Jarvis command center" });
  await expect(hero.getByRole("heading")).toBeVisible();
  const bounds = await hero.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const send = await hero.getByRole("button", { name: "Send to Jarvis" }).boundingBox();
  expect(send!.height).toBeGreaterThanOrEqual(44);
  expect(send!.width).toBeGreaterThanOrEqual(44);
  await hero.screenshot({ path: testInfo.outputPath("command-center.png") });
});

test("the deadline unlocks a first-job lookup even when its server action never resolves", async ({ page }) => {
  await page.goto("/voice-lab");
  await page.getByRole("button", { name: "Open Jarvis conversation" }).click();
  await page.clock.install();
  let requested = false;
  let release: () => void = () => {};
  await page.route("**/voice-lab", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requested = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.abort().catch(() => {});
  });
  const input = page.getByRole("textbox", { name: "Ask Jarvis a question" });
  await input.fill("Open the first job");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.fastForward(65001);
  try {
    await expect(input).toBeEnabled();
    await expect(page.getByText("This request took too long. Try a narrower question.", { exact: true })).toBeVisible();
  } finally { release(); }
});
