import { expect, test } from '@playwright/test';

/**
 * Every page loads against the real server with no browser errors, holds its
 * layout on a phone, and the landing page actually shows what it hides for its
 * scroll animations.
 */

const ROUTES = [
  { path: '/', heading: 'Ask your own stuff' },
  { path: '/simulator', heading: 'Ask your stack' },
  { path: '/console', heading: 'Your apps' },
  { path: '/console/shortcuts', heading: 'Shortcuts' },
  { path: '/console/settings', heading: 'Settings' },
];

for (const route of ROUTES) {
  test(`${route.path} renders with no browser errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(route.path);
    await expect(page.locator('h1').first()).toContainText(route.heading);
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
  });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/console', '/console/shortcuts', '/console/settings', '/simulator']) {
    test(`${path} keeps the navigation on one line and never scrolls sideways`, async ({ page }) => {
      await page.goto(path);

      const bar = await page.locator('header.topbar').boundingBox();
      expect(bar?.height ?? Infinity).toBeLessThanOrEqual(64);

      const links = page.locator('.nav a');
      for (let i = 0; i < (await links.count()); i += 1) {
        const box = await links.nth(i).boundingBox();
        // One line of text; a wrapped link is roughly twice this.
        expect(box?.height ?? Infinity).toBeLessThan(40);
      }

      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(sideways).toBe(false);
    });
  }
});

test('the landing page reveals every section as you scroll', async ({ page }) => {
  await page.goto('/');
  const total = await page.locator('.reveal').count();

  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(120);
  }

  await expect.poll(() => page.locator('.reveal.seen').count()).toBe(total);
  await expect(page.locator('#tools li.in')).toHaveCount(3);
});

test('the landing page stays readable with script turned off', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');

  const hidden = await page
    .locator('.reveal')
    .evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).opacity === '0').length);
  expect(hidden).toBe(0);
  await context.close();
});
