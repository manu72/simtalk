import { expect, test } from '@playwright/test';

test('renders the SimTalk scaffold shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SimTalk' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Listener Mode/i })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Turn-about Mode/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Practice Mode/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prepare translation session/i })).toBeVisible();
});
