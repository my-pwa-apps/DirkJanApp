const { test, expect } = require('@playwright/test');
const { openApp } = require('../support/dirkjan-mocks.cjs');

async function swipe(page, startX, startY, endX, endY) {
  await page.evaluate(({ startX, startY, endX, endY }) => {
    const dispatchTouch = (type, x, y, property) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, property, {
        value: [{ clientX: x, clientY: y }]
      });
      const shell = document.getElementById('fullscreen-shell');
      const target = (shell && !shell.hidden && document.getElementById('rotated-comic'))
        || document.getElementById('comic');
      target.dispatchEvent(event);
    };
    dispatchTouch('touchstart', startX, startY, 'touches');
    dispatchTouch('touchend', endX, endY, 'changedTouches');
  }, { startX, startY, endX, endY });
}

async function setOrientation(page, type) {
  await page.evaluate(orientationType => {
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { type: orientationType, lock: () => Promise.resolve(), unlock: () => {} }
    });
    window.dispatchEvent(new Event('orientationchange'));
  }, type);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('portrait swipes navigate both directions and disabled swipe stays put', async ({ page }) => {
  const result = await openApp(page);
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');

  await swipe(page, 330, 420, 60, 420);
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-04');
  await expect(page.locator('#comic-status')).toBeHidden();
  await swipe(page, 60, 420, 330, 420);
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  await expect(page.locator('#comic-status')).toBeHidden();

  await page.locator('#swipe').evaluate(element => { element.checked = false; });
  await swipe(page, 330, 420, 60, 420);
  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-02');
  expect(result.errors).toEqual([]);
});

test('rapid swipes cancel stale work and settle on the latest navigation', async ({ page }) => {
  const result = await openApp(page);
  await swipe(page, 330, 420, 60, 420);
  await swipe(page, 330, 420, 60, 420);

  await expect(page.locator('#DatePicker')).toHaveValue('2026-05-05');
  await expect(page.locator('#comic-announcer')).toHaveText(/05-05-2026 geladen/);
  expect(result.errors).toEqual([]);
});

test('orientation enters and exits fullscreen while closing open settings', async ({ page }) => {
  const result = await openApp(page);
  const settings = page.locator('#settings');
  await settings.click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);

  await setOrientation(page, 'landscape-primary');
  await expect(page.locator('#fullscreen-shell')).not.toHaveAttribute('hidden');
  await expect(page.locator('#rotated-comic')).toBeVisible();
  await expect(page.locator('#settingsDIV')).not.toHaveClass(/visible/);
  await expect(page.locator('#settingsDIV')).toHaveAttribute('inert', '');
  await expect(settings).toHaveAttribute('aria-expanded', 'false');

  await setOrientation(page, 'portrait-primary');
  await expect(page.locator('#fullscreen-shell')).toHaveAttribute('hidden', '');
  await expect(page.locator('#rotated-comic')).toBeHidden();
  await expect(page.locator('#comic')).toBeVisible();
  expect(result.errors).toEqual([]);
});