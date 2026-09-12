import { expect, test } from '@playwright/test';

/**
 * Adding apps through the console against the real server. It runs on a scratch
 * copy of config/apps with its own data folder (tests/e2e/prepare.mjs), so these
 * tests can write apps and keys freely.
 */

test('adds a CSV file from the data folder, edits it, then removes it', async ({ page, request }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();

  await page.fill('#source', 'prices.csv');
  await expect(page.locator('#branch')).toBeHidden();
  await expect(page.locator('#keybox')).toBeHidden();
  await page.click('#inspect');

  await expect(page.locator('#sourceNote')).toContainText('Found 3 records');
  await expect(page.locator('#id')).toHaveValue('prices');
  await expect(page.locator('#fields input[data-name="title"]')).toHaveValue('{Date}: {Price}');
  await expect(page.locator('#found .kind-tag')).toHaveText('File · CSV');
  await expect(page.locator('#pRead')).not.toBeChecked();

  await page.click('#save');
  const card = page.locator('.item', { hasText: 'prices_search' });
  await expect(card.locator('.kind-tag')).toHaveText('File · CSV');
  await expect(card).toContainText('3 records');

  // Build a different title by clicking columns rather than typing paths.
  await card.getByRole('button', { name: 'Edit' }).click();
  await page.click('#loadColumns');
  const title = page.locator('#fields input[data-name="title"]');
  await title.fill('');
  await page.locator('#columns button', { hasText: 'Price' }).click();
  await page.locator('#columns button', { hasText: 'Date' }).click();
  await expect(title).toHaveValue('{Price} {Date}');
  await page.click('#save');
  await expect(page.locator('#editor')).toBeHidden();

  const listed = (await (await request.get('/console/api/apps')).json()) as {
    apps: { id: string; fields: { title: string } }[];
  };
  expect(listed.apps.find((app) => app.id === 'prices')?.fields.title).toBe('{Price} {Date}');

  await page.locator('.item', { hasText: 'prices_search' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.item', { hasText: 'prices_search' })).toHaveCount(0);
});

test('a key pasted for a link is stored on the server and only referenced in the request', async ({
  page,
  request,
}) => {
  const captured: { body?: { input: string; headers: Record<string, string> } } = {};
  await page.route('**/console/api/inspect', async (route) => {
    captured.body = route.request().postDataJSON() as { input: string; headers: Record<string, string> };
    await route.fulfill({ status: 502, json: { error: 'Stopped by the test.' } });
  });

  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();
  await page.fill('#source', 'https://api.example.com/v1/items');
  await expect(page.locator('#keybox')).toBeVisible();
  await expect(page.locator('#branch')).toBeHidden();

  await page.locator('#keybox summary').click();
  await expect(page.locator('#secretName')).toHaveValue('EXAMPLE_KEY');
  await page.fill('#secretValue', 'sk-e2e-4242');
  await page.click('#inspect');
  await expect(page.locator('#sourceNote')).toContainText('Stopped by the test.');

  expect(captured.body?.headers).toEqual({ Authorization: 'Bearer {{secret:EXAMPLE_KEY}}' });
  expect(JSON.stringify(captured.body)).not.toContain('sk-e2e-4242');

  const keys = await (await request.get('/console/api/secrets')).text();
  expect(keys).toContain('EXAMPLE_KEY');
  expect(keys).not.toContain('sk-e2e-4242');
  await request.delete('/console/api/secrets/EXAMPLE_KEY');
});

test('a GitHub repository asks for a branch, not a key', async ({ page }) => {
  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();

  await page.fill('#source', 'https://github.com/owner/name');

  await expect(page.locator('#branch')).toBeVisible();
  await expect(page.locator('#keybox')).toBeHidden();
});

test('says plainly when a file is not in the data folder', async ({ page }) => {
  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();

  await page.fill('#source', 'missing.csv');
  await page.click('#inspect');

  await expect(page.locator('#sourceNote')).toContainText('no file at missing.csv');
  await expect(page.locator('#details')).toBeHidden();
});

test('the settings page lists saved keys by name only', async ({ page, request }) => {
  await request.put('/console/api/secrets/SETTINGS_E2E_KEY', { data: { value: 'value-never-shown' } });

  await page.goto('/console/settings');

  await expect(page.locator('.key-row', { hasText: 'SETTINGS_E2E_KEY' })).toContainText('not used by any app');
  expect(await page.content()).not.toContain('value-never-shown');
  await expect(page.locator('#dataDir')).toHaveValue('tests/e2e/.data');

  page.on('dialog', (dialog) => void dialog.accept());
  await page.locator('.key-row', { hasText: 'SETTINGS_E2E_KEY' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.key-row', { hasText: 'SETTINGS_E2E_KEY' })).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the add form, with its key section open, never scrolls sideways', async ({ page }) => {
    await page.goto('/console');
    await page.getByRole('button', { name: 'Add an app' }).click();
    await page.fill('#source', 'https://api.example.com/v1/items');
    await page.locator('#keybox summary').click();

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways).toBe(false);
  });
});
