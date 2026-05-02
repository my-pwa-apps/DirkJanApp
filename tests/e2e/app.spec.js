const { test, expect } = require('@playwright/test');
const { openApp } = require('../support/dirkjan-mocks.cjs');

test('core comic workflow boots with mocked DirkJan content', async ({ page }) => {
  const result = await openApp(page);

  await expect(page).toHaveTitle(/Daily DirkJan Comics/);
  await expect(page.locator('h1.visually-hidden')).toHaveText(/Daily DirkJan Comics/);
  await expect(page.locator('h1.visually-hidden')).toHaveCSS('clip-path', /inset/);
  await expect(page.getByRole('button', { name: 'Instellingen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favoriet toevoegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delen' })).toBeVisible();

  await page.getByRole('button', { name: 'Instellingen' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await expect(page.locator('#swipe')).toBeChecked();
  await page.getByRole('button', { name: 'Sluiten' }).click();
  await expect(page.locator('#settingsDIV')).not.toHaveClass(/visible/);

  await page.locator('#favheart').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]').length)).toBe(1);
  await page.locator('#favheart').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]').length)).toBe(0);

  expect(result.errors).toEqual([]);
});

test('proxy fallback recovers when the preferred worker fails', async ({ page }) => {
  const result = await openApp(page, { proxyFailures: 1 });

  await expect(page.locator('#comic')).not.toHaveAttribute('src', /^$/);
  expect(result.proxyRequests.length).toBeGreaterThanOrEqual(2);
  expect(result.errors).toEqual([]);
});

test('stale future last comic is clamped before startup fetches', async ({ page }) => {
  const result = await openApp(page, {
    initialStorage: {
      lastdate: 'true',
      lastcomic: 'Sat May 09 2026 00:00:00 GMT+0200'
    }
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.errors).toEqual([]);
});

test('latest startup lookup includes prepublished weekdays without probing Saturday', async ({ page }) => {
  const result = await openApp(page);

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
});

test('corrupt localStorage favorites recover without breaking boot', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('favs', '{bad json');
    localStorage.setItem('showfavs', 'true');
    localStorage.setItem('lastdate', 'false');
  });

  const result = await openApp(page);

  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('basic app shell performance budget stays bounded', async ({ page }) => {
  const startedAt = Date.now();
  const result = await openApp(page);
  const loadDuration = Date.now() - startedAt;
  const resourceCount = await page.evaluate(() => performance.getEntriesByType('resource').length);

  expect(loadDuration).toBeLessThan(10_000);
  expect(resourceCount).toBeLessThan(80);
  expect(result.errors).toEqual([]);
});
