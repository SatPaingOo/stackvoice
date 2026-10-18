import { expect, test } from '@playwright/test';

import { installFakeSpeech } from './fake-speech';

/**
 * The answer card end to end: the simulator asks the real server over MCP, reads
 * the card the tool links to, and shows it as an MCP Apps host would. A file app
 * from the e2e data folder keeps it off the network.
 */

test('an answer shows the entries behind it in a sandboxed card', async ({ page, request }) => {
  const inspected = await request.post('/console/api/inspect', { data: { input: 'prices.csv' } });
  const { proposal } = (await inspected.json()) as { proposal: Record<string, unknown> };
  const saved = await request.put('/console/api/apps/prices', {
    data: {
      label: 'Prices',
      description: 'Gold prices by month.',
      enabled: true,
      primitives: { search: true, read: true, status: true },
      location: proposal['location'],
      itemsPath: proposal['itemsPath'],
      fields: proposal['fields'],
      statusFields: proposal['statusFields'],
    },
  });
  expect(saved.ok()).toBe(true);

  try {
    await page.addInitScript(installFakeSpeech);
    await page.goto('/simulator');
    await page.locator('#say').fill('What is in my prices?');
    await page.locator('#say').press('Enter');

    const frame = page.locator('iframe.view');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    const card = page.frameLocator('iframe.view');
    await expect(card.locator('h2')).toHaveText('Prices');
    await expect(card.locator('li')).toHaveCount(3);
    await expect(card.locator('li').first()).toContainText('2026-09');
    // The card told the host its height, and the host made room for it.
    await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(120);
  } finally {
    await request.delete('/console/api/apps/prices');
  }
});
