import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`Intelligence decisions and prepared work remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/voice-lab/intelligence');
    await expect(page.getByRole('heading', { name: 'Decide what moves the business.' })).toBeVisible();
    const card = page.getByRole('article', { name: 'Review the overdue balance before following up', exact: true });
    await expect(card.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByText('Decision saved.', { exact: true })).toBeVisible();
    await card.getByText('Prepared work · Unsent collection draft', { exact: true }).click();
    await expect(card.getByText('UNSENT — SYNTHETIC EXAMPLE', { exact: false })).toBeVisible();
    await card.getByText('Evidence, reasoning & validation', { exact: true }).click();
    await expect(card.getByRole('link', { name: 'Synthetic invoice LAB-100', exact: true })).toHaveAttribute('href', '/voice-lab/intelligence?record=LAB-100');
    await card.getByText('Record an outcome', { exact: true }).click();
    await card.getByLabel('What happened?').fill('Synthetic acceptance outcome');
    await card.getByLabel('Realized revenue ($)').fill('0');
    await card.getByRole('button', { name: 'Save reported outcome' }).click();
    await expect(page.getByText('Owner-reported outcome saved.', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Complete', exact: true }).click();
    await page.getByRole('button', { name: 'Outcomes', exact: true }).click();
    await expect(card).toBeVisible();
    await card.getByText('View or update reported outcome', { exact: true }).click();
    await expect(card.getByLabel('What happened?')).toHaveValue('Synthetic acceptance outcome');
    await expect(card.getByLabel('Realized revenue ($)')).toHaveValue('0');
    await expect(card.getByLabel('Realized savings ($)')).toHaveValue('');
    await card.getByRole('button', { name: 'Return to Watch' }).click();
    await page.locator('[aria-label="Decision views"]').getByRole('button', { name: 'Watch', exact: true }).click();
    await expect(card).toBeVisible();
    await page.getByText('Intelligence preferences', { exact: true }).click();
    await page.getByLabel('Target planned revenue per budgeted hour ($)').fill('145');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Target planned revenue per budgeted hour ($)')).toHaveValue('145');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Intelligence lab shows request failures and permits retry without erasing decisions', async ({ page }) => {
  await page.goto('/voice-lab/intelligence');
  await page.getByLabel('Fixture mode').selectOption('error');
  await page.getByRole('button', { name: 'Scan operations' }).click();
  const applicationError = page.getByRole('alert').filter({ hasText: 'Synthetic connection failure. Your change was not saved.' });
  await expect(applicationError).toBeVisible();
  await expect(page.getByRole('article', { name: 'Review the overdue balance before following up', exact: true })).toBeVisible();
  await page.getByLabel('Fixture mode').selectOption('normal');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(applicationError).toHaveCount(0);
});
