import { expect, test } from '@playwright/test';

test('renders the SimTalk scaffold shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SimTalk' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prepare Listener Mode/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prepare Turn-about Mode/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Prepare Practice Mode/i })).toBeVisible();
});
