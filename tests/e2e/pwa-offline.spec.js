const { test, expect } = require('@playwright/test');
const { mockExternalServices } = require('../support/dirkjan-mocks.cjs');

test('service worker precaches the app shell and serves it while offline', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'Offline service worker lifecycle is covered in the desktop Chromium project.');

  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lastdate', 'false');
  });
  await mockExternalServices(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#comic')).toHaveJSProperty('complete', true);

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    await registration.update();
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle(/Offline - DirkJan Comics/);
  await expect(page.getByRole('heading', { name: 'Je bent offline' })).toBeVisible();
  expect(errors.filter(error => !error.includes('net::ERR_INTERNET_DISCONNECTED'))).toEqual([]);
});
