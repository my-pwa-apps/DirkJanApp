const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { openApp } = require('../support/dirkjan-mocks.cjs');

async function expectNoSeriousAxeViolations(page, contextLabel) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severeViolations = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  expect(severeViolations, contextLabel).toEqual([]);
}

test('core screens have no serious automated accessibility violations', async ({ page }) => {
  await openApp(page);
  await expectNoSeriousAxeViolations(page, 'main comic viewer');

  await page.getByRole('button', { name: 'Instellingen' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);
  await expectNoSeriousAxeViolations(page, 'settings dialog');
});

test('visible controls expose understandable accessible names', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Instellingen' }).click();

  const unnamedControls = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, input, select, a[href]')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.disabled;
      });

    return controls
      .filter(element => {
        const text = element.textContent?.trim();
        const label = element.getAttribute('aria-label') || [...(element.labels || [])].map(item => item.textContent?.trim()).join(' ');
        const title = element.getAttribute('title');
        const labelledBy = element.getAttribute('aria-labelledby');
        const imageAlt = element.querySelector('img[alt]')?.getAttribute('alt');
        return !text && !label && !title && !labelledBy && !imageAlt;
      })
      .map(element => element.id || element.className || element.tagName);
  });

  expect(unnamedControls).toEqual([]);
});

test('settings manages focus and hidden interaction state', async ({ page }) => {
  await openApp(page);
  const trigger = page.getByRole('button', { name: 'Instellingen' });
  const panel = page.locator('#settingsDIV');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#settingsClose')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toHaveAttribute('inert', '');
  await expect(trigger).toBeFocused();
});

test('main workflow controls are reachable and stable on mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  for (const selector of ['#First', '#Previous', '#Random', '#DatePicker', '#Next', '#Current', '#settings', '#favheart', '#share']) {
    await expect(page.locator(selector)).toBeVisible();
  }

  await page.getByRole('button', { name: 'Instellingen' }).click();
  await expect(page.locator('#settingsDIV')).toHaveClass(/visible/);

  const overlappingControls = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#settingsDIV button:not([disabled]), #settingsDIV input, #settingsDIV label')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(element => ({ element, id: element.id || element.textContent.trim(), rect: element.getBoundingClientRect() }));

    for (let outer = 0; outer < controls.length; outer += 1) {
      for (let inner = outer + 1; inner < controls.length; inner += 1) {
        if (controls[outer].element.contains(controls[inner].element) || controls[inner].element.contains(controls[outer].element)) continue;
        const a = controls[outer].rect;
        const b = controls[inner].rect;
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (overlapX > 8 && overlapY > 8) return [controls[outer].id, controls[inner].id];
      }
    }
    return [];
  });

  expect(overlappingControls).toEqual([]);
});

test('favorite heart stays black in selected and unselected mobile states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);

  const heart = page.locator('#favheart svg');
  await expect(heart).toHaveCSS('stroke', 'rgb(0, 0, 0)');
  await expect(heart).toHaveCSS('fill', 'none');

  await page.locator('#favheart').click();
  await expect(heart).toHaveCSS('stroke', 'rgb(0, 0, 0)');
  await expect(heart).toHaveCSS('fill', 'rgb(0, 0, 0)');

  await page.locator('#favheart').click();
  await expect(heart).toHaveCSS('stroke', 'rgb(0, 0, 0)');
  await expect(heart).toHaveCSS('fill', 'none');
});
