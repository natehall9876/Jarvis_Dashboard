import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("sign in, browse, save note and photo, reload, then deny anonymous reads", async ({ page }, testInfo) => {
  const jobId = process.env.E2E_TEST_JOB_ID!;
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(url, key, options);
  const credentials = { email: process.env.E2E_TEST_EMAIL!, password: process.env.E2E_TEST_PASSWORD! };
  const login = await db.auth.signInWithPassword(credentials);
  expect(login.error, "Test-account sign-in must succeed").toBeNull();
  try {
    const job = await db.from("jobs").select("id, properties!inner(clients!inner(id, data_source))").eq("id", jobId).single();
    expect(job.error).toBeNull();
    // Both explicit designation AND demo classification are required before writes.
    const related = job.data?.properties as unknown as { clients: { id: string; data_source: string } };
    expect(related?.clients?.data_source, "The designated job must belong to a demo client").toBe("demo");

    await page.goto(`/login?redirectTo=/jobs/${jobId}`);
    await page.getByLabel("Email", { exact: true }).fill(credentials.email);
    await page.getByLabel("Password", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));
    await page.goto("/clients");
    await expect(page.locator(`a[href="/clients/${related.clients.id}"]`).first()).toBeVisible();
    await page.goto("/jobs");
    const jobLink = page.locator(`a[href="/jobs/${jobId}"]`).first();
    await expect(jobLink, "Designated test job must be visible in Jobs").toBeVisible();
    await jobLink.click();

    const marker = `Persistence verification ${testInfo.project.name} ${randomUUID()}`;
    await page.getByLabel("New job note").fill(marker);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await page.getByLabel("Choose a photo").setInputFiles({
      name: "verification.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
    });
    await page.getByPlaceholder("Caption (optional)").fill(marker);
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Photo uploaded and saved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("li").filter({ hasText: marker })).toBeVisible();
    const image = page.getByRole("img", { name: marker, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    const notes = await db.from("job_notes").select("id").eq("job_id", jobId).eq("body", marker);
    expect(notes.error).toBeNull();
    expect(notes.data).toHaveLength(1);
    const photos = await db.from("job_photos").select("storage_path").eq("job_id", jobId).eq("caption", marker);
    expect(photos.error).toBeNull();
    expect(photos.data).toHaveLength(1);

    const anon = createClient(url, key, options);
    for (const table of ["clients", "jobs", "job_notes", "job_photos"]) {
      const result = await anon.from(table).select("id").limit(1);
      expect(result.data ?? []).toEqual([]);
      if (result.error) expect([401, 403]).toContain(result.status);
    }
    const object = await anon.storage.from("job-photos").download(photos.data![0].storage_path);
    expect(object.error).not.toBeNull();
    expect(object.data).toBeNull();
    // Test records remain for owner review; no production cleanup/deletion.
    await page.context().clearCookies();
    await page.goto(`/jobs/${jobId}`);
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
