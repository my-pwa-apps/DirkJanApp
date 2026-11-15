const { test, expect } = require('@playwright/test');
const { openApp } = require('../support/dirkjan-mocks.cjs');

test('keyboard shortcuts navigate and inputs suppress navigation shortcuts', async ({ page }) => {
  const result = await openApp(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-04');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await page.locator('#DatePicker').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual(['2026-05-02']);
  expect(result.errors).toEqual([]);
});

test('stored dark mode restores and toggles persistently', async ({ page }) => {
  const result = await openApp(page, { initialStorage: { lastdate: 'false', darkmode: 'true' } });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toggle = page.locator('#darkmode');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('darkmode'))).toBe('false');
  expect(result.errors).toEqual([]);
});

test('shuffle mode preserves random navigation history', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  const result = await openApp(page, { initialStorage: { lastdate: 'false', shuffle: 'true' } });
  await page.locator('#Random').click();
  await expect(page.locator('#DatePicker')).not.toHaveValue('2026-05-02');
  await page.locator('#Previous').click();
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  expect(result.errors).toEqual([]);
});

test('favorites import validates input and export downloads JSON', async ({ page }) => {
  const result = await openApp(page);
  const input = page.locator('#importFavsInput');
  await input.setInputFiles({
    name: 'favorites.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ favorites: ['2026-05-01', 'invalid', '2026-05-01'] }))
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual(['2026-05-01']);
  await expect(page.locator('#notificationToast')).toContainText('1 favoriet geïmporteerd');

  await page.locator('#settings').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportFavs').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dirkjan-favorieten.json');

  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#notificationToast')).toContainText('Ongeldig favorietenbestand');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual(['2026-05-01']);
  expect(result.errors).toEqual([]);
});

test('share fallback exposes manual copy content without Web Share or clipboard', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  const result = await openApp(page);
  let promptData;
  page.once('dialog', async prompt => {
    promptData = { type: prompt.type(), defaultValue: prompt.defaultValue() };
    await prompt.dismiss();
  });
  await page.locator('#share').click();
  expect(promptData.type).toBe('prompt');
  expect(promptData.defaultValue).toContain('2026-05-02');
  expect(result.errors).toEqual([]);
});

test('favorites import rejects impossible and out-of-range dates', async ({ page }) => {
  const result = await openApp(page);
  const input = page.locator('#importFavsInput');
  await input.setInputFiles({
    name: 'favorites.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(['2026-02-31', '2015-05-01', '2030-01-01']))
  });
  await expect(page.locator('#notificationToast')).toContainText('Geen geldige favorieten gevonden');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favs') || '[]'))).toEqual([]);
  expect(result.errors).toEqual([]);
});

test('share uses the comic on screen while another date is still loading', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  const result = await openApp(page);
  // Hold the next comic's metadata so its navigation stays in flight.
  await page.route('**/-/comic-metadata?date=20260420*', () => {});
  await page.locator('#DatePicker').fill('2026-04-20');
  await page.locator('#DatePicker').dispatchEvent('input');
  await expect(page.locator('#DatePicker')).toHaveValue('2026-04-20');

  let promptValue;
  page.once('dialog', async prompt => {
    promptValue = prompt.defaultValue();
    await prompt.dismiss();
  });
  await page.locator('#share').click();
  await expect.poll(() => promptValue).toContain('2026-05-02');
  expect(promptValue).toContain('20260502-dirkjan-test.png');
  expect(promptValue).not.toContain('2026-04-20');
  expect(result.errors).toEqual([]);
});

test('service worker update notification can be deferred', async ({ page }) => {
  const result = await openApp(page, { serviceWorkerUpdate: true });
  await expect(page.locator('#update-notification')).toContainText('Nieuwe versie beschikbaar');
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.locator('#update-notification')).toHaveCount(0);
  expect(result.errors).toEqual([]);
});