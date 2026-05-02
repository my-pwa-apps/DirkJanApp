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
  await expect(page.getByRole('radio', { name: 'Vandaag' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Nieuwste beschikbaar' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'Laatst gelezen comic' })).not.toBeChecked();
  await expect(page.locator('#startlatest')).not.toBeChecked();
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
      startmode: 'last',
      lastcomic: 'Sat May 09 2026 00:00:00 GMT+0200'
    }
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.errors).toEqual([]);
});

test('startup shows today when last comic is not remembered', async ({ page }) => {
  const result = await openApp(page);

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  expect(result.proxyRequests.some(url => url.includes('20260502'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
});

test('latest button advances from today to newer prepublished comic', async ({ page }) => {
  const result = await openApp(page);

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await page.getByRole('button', { name: 'Laatste' }).click();
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
});

test('startup can be configured to show latest available comic', async ({ page }) => {
  const result = await openApp(page, {
    initialStorage: {
      startmode: 'latest'
    }
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.errors).toEqual([]);
});

test('startup mode radio setting persists user choice', async ({ page }) => {
  const result = await openApp(page);

  await page.getByRole('button', { name: 'Instellingen' }).click();
  await page.getByText('Nieuwste beschikbaar').click();
  await expect(page.getByRole('radio', { name: 'Nieuwste beschikbaar' })).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startmode'))).toBe('latest');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startlatest'))).toBe('true');
  await page.getByText('Laatst gelezen comic').click();
  await expect(page.getByRole('radio', { name: 'Laatst gelezen comic' })).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startmode'))).toBe('last');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastdate'))).toBe('true');
  await page.getByText('Vandaag').click();
  await expect(page.getByRole('radio', { name: 'Vandaag' })).toBeChecked();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startmode'))).toBe('today');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('startlatest'))).toBe('false');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastdate'))).toBe('false');
  expect(result.errors).toEqual([]);
});

test('latest startup setting overrides remembered older comic', async ({ page }) => {
  const result = await openApp(page, {
    initialStorage: {
      startmode: 'latest',
      lastcomic: 'Fri May 01 2026 00:00:00 GMT+0200'
    }
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  expect(result.errors).toEqual([]);
});

test('remembered older comic stays put while newer comic remains available', async ({ page }) => {
  const result = await openApp(page, {
    initialStorage: {
      startmode: 'last',
      lastcomic: 'Fri May 01 2026 00:00:00 GMT+0200'
    }
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-01');
  expect(result.proxyRequests.some(url => url.includes('20260501'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260509'))).toBe(false);
  await page.getByRole('button', { name: 'Laatste' }).click();
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-08');
  expect(result.errors).toEqual([]);
});

test('latest navigation falls back to the nearest available comic instead of random', async ({ page }) => {
  const result = await openApp(page, {
    unavailableDates: ['20260508']
  });

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await page.getByRole('button', { name: 'Laatste' }).click();
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-07');
  expect(result.proxyRequests.some(url => url.includes('20260508'))).toBe(true);
  expect(result.proxyRequests.some(url => url.includes('20260507'))).toBe(true);
  expect(result.errors).toEqual([]);
});

test('unavailable manual date falls back without persisting the failed date', async ({ page }) => {
  const result = await openApp(page, {
    unavailableDates: ['20260504']
  });

  await page.locator('#DatePicker').fill('2026-05-04');
  await page.locator('#DatePicker').dispatchEvent('input');

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lastcomic'))).not.toContain('May 04 2026');
  expect(result.errors).toEqual([]);
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
