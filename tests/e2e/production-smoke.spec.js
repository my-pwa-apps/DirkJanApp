const { test, expect } = require('@playwright/test');

test.describe('production smoke', () => {
  test('deployed app boots and exposes core controls', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('https://dirkjanapp.pages.dev/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#comic')).toBeVisible();
    await expect.poll(
      () => page.locator('#comic').evaluate(img => img.naturalWidth),
      { timeout: 20_000 }
    ).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Instellingen' })).toBeVisible();
    await page.getByRole('button', { name: 'Instellingen' }).click();
    await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
    expect(consoleErrors).toEqual([]);
  });
});
