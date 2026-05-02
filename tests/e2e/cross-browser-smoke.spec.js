const { test, expect } = require('@playwright/test');
const { openApp } = require('../support/dirkjan-mocks.cjs');

test('core comic workflow works across browser engines', async ({ page }) => {
  const result = await openApp(page);

  await expect(page).toHaveTitle(/Daily DirkJan Comics/);
  await expect(page.locator('#comic')).toBeVisible();
  await expect(page.locator('#DatePicker')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volgende' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vorige' })).toBeVisible();

  await page.getByRole('button', { name: 'Instellingen' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await expect(page.locator('#showfavs')).toBeVisible();
  await page.getByRole('button', { name: 'Sluiten' }).click();

  expect(result.errors).toEqual([]);
});
