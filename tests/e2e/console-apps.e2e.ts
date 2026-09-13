import { expect, test, type Page } from '@playwright/test';

/**
 * The console's add and edit dialogs against the real server. It runs on a
 * scratch copy of config/apps with its own data folder (tests/e2e/prepare.mjs),
 * so these tests can write apps, shortcuts and keys freely.
 */

const confirmDialog = (page: Page) => page.locator('dialog.confirm');

test('adds a CSV file from the data folder in a dialog, edits it, then removes it', async ({ page, request }) => {
  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();
  await expect(page.locator('#appModal')).toBeVisible();

  await page.fill('#source', 'prices.csv');
  await expect(page.locator('#branch')).toBeHidden();
  await expect(page.locator('#keybox')).toBeHidden();
  await page.click('#inspect');

  await expect(page.locator('#appNote')).toContainText('Found 3 records');
  await expect(page.locator('#id')).toHaveValue('prices');
  await expect(page.locator('#fields input[data-name="title"]')).toHaveValue('{Date}: {Price}');
  await expect(page.locator('#found .kind-tag')).toHaveText('File · CSV');
  await expect(page.locator('#pRead')).not.toBeChecked();

  await page.click('#save');
  await expect(page.locator('#appModal')).toBeHidden();
  const card = page.locator('.item', { hasText: 'prices_search' });
  await expect(card.locator('.kind-tag')).toHaveText('File · CSV');
  await expect(card).toContainText('3 records');

  // Build a different title by clicking columns rather than typing paths.
  await card.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#appModal')).toBeVisible();
  await page.click('#loadColumns');
  const title = page.locator('#fields input[data-name="title"]');
  await title.fill('');
  await page.locator('#columns button', { hasText: 'Price' }).click();
  await page.locator('#columns button', { hasText: 'Date' }).click();
  await expect(title).toHaveValue('{Price} {Date}');
  await page.click('#save');
  await expect(page.locator('#appModal')).toBeHidden();

  const listed = (await (await request.get('/console/api/apps')).json()) as {
    apps: { id: string; fields: { title: string } }[];
  };
  expect(listed.apps.find((app) => app.id === 'prices')?.fields.title).toBe('{Price} {Date}');

  await page.locator('.item', { hasText: 'prices_search' }).getByRole('button', { name: 'Remove' }).click();
  await expect(confirmDialog(page)).toContainText('Remove Prices?');
  await confirmDialog(page).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.item', { hasText: 'prices_search' })).toHaveCount(0);
});

test('pressing Enter in the source box looks at it, and what it found can still be saved', async ({ page }) => {
  await page.goto('/console');
  await page.getByRole('button', { name: 'Add an app' }).click();

  await page.fill('#source', 'prices.csv');
  await page.press('#source', 'Enter');
  // The box loses focus as the form moves on; that must not throw away what was found.
  await expect(page.locator('#appNote')).toContainText('Found 3 records');
  await page.fill('#id', 'prices-enter');
  await page.click('#save');
  await expect(page.locator('#appModal')).toBeHidden();

  const card = page.locator('.item', { hasText: 'prices-enter_search' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Remove' }).click();
  await confirmDialog(page).getByRole('button', { name: 'Remove' }).click();
  await expect(card).toHaveCount(0);
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
  await expect(page.locator('#appNote')).toContainText('Stopped by the test.');

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

  await expect(page.locator('#appNote')).toContainText('no file at missing.csv');
  await expect(page.locator('#found')).toBeHidden();
});

test('a dialog closes at once when nothing changed, and asks first when something did', async ({ page }) => {
  await page.goto('/console');
  const modal = page.locator('#appModal');

  await page.getByRole('button', { name: 'Add an app' }).click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  await page.getByRole('button', { name: 'Add an app' }).click();
  await page.fill('#source', 'half-typed');
  await page.keyboard.press('Escape');
  await expect(confirmDialog(page)).toContainText('Discard your changes?');
  await confirmDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(modal).toBeVisible();
  await expect(page.locator('#source')).toHaveValue('half-typed');

  await page.click('#cancel');
  await confirmDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(modal).toBeHidden();
});

test('the settings page adds a key in a dialog and lists it by name only', async ({ page }) => {
  await page.goto('/console/settings');
  await expect(page.locator('#dataDir')).toHaveValue('tests/e2e/.data');

  await page.click('#addKey');
  await expect(page.locator('#keyModal')).toBeVisible();
  await page.fill('#newKeyName', 'settings_e2e_key');
  await page.fill('#newKeyValue', 'value-never-shown');
  await page.click('#saveKey');
  await expect(page.locator('#keyModal')).toBeHidden();

  const row = page.locator('.key-row', { hasText: 'SETTINGS_E2E_KEY' });
  await expect(row).toContainText('not used by any app');
  expect(await page.content()).not.toContain('value-never-shown');

  await row.getByRole('button', { name: 'Remove' }).click();
  await confirmDialog(page).getByRole('button', { name: 'Remove key' }).click();
  await expect(page.locator('.key-row', { hasText: 'SETTINGS_E2E_KEY' })).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the add dialog fills the screen and never scrolls sideways', async ({ page }) => {
    await page.goto('/console');
    await page.getByRole('button', { name: 'Add an app' }).click();
    await page.fill('#source', 'https://api.example.com/v1/items');
    await page.locator('#keybox summary').click();

    const panel = await page.locator('#appModal .modal-panel').boundingBox();
    expect(panel?.width ?? 0).toBeGreaterThanOrEqual(380);
    expect(panel?.width ?? Infinity).toBeLessThanOrEqual(390);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways).toBe(false);
  });
});
