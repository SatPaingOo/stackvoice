import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The shortcut builder against the real server: build a flow from blocks, try
 * it, save it, and ask for it through the simulator, which calls it over MCP.
 * The flows here ask no tools, so nothing depends on a network.
 */

const confirmDialog = (page: Page): Locator => page.locator('dialog.confirm');
const rootCards = (page: Page): Locator => page.locator('#flow > .block-list > .block-card');
const branch = (ifCard: Locator, name: 'then' | 'otherwise'): Locator =>
  ifCard.locator(`:scope > .block-body > div > .branch.${name} > .block-list-editor`);
const addTo = (list: Locator, kind: string): Promise<void> =>
  list.locator(':scope > .block-adder button', { hasText: new RegExp(`^${kind}$`) }).click();

async function openBuilder(page: Page): Promise<void> {
  await page.goto('/console/shortcuts');
  await page.getByRole('button', { name: 'Add a shortcut' }).click();
  await expect(page.locator('#shortcutModal')).toBeVisible();
}

test('builds a flow with a slot and an If, tries it, saves it, and the simulator routes to it', async ({
  page,
  request,
}) => {
  await openBuilder(page);
  await page.fill('#name', 'greet person');
  await expect(page.locator('#toolName')).toHaveText('Becomes the tool greet_person');
  await page.locator('#phrases input').first().fill('greet {person}');
  await expect(page.locator('#slotsLine')).toContainText('{person}');

  await addTo(page.locator('#flow'), 'If');
  const ifCard = rootCards(page).first();
  await expect(ifCard).toHaveClass(/k-if/);
  await ifCard.locator('select.condition-text-op').selectOption('contains');
  await ifCard.locator('.condition-value input').fill('sat');

  const then = branch(ifCard, 'then');
  await addTo(then, 'Say');
  await then.locator('.k-say input').fill('Hello boss.');

  const otherwise = branch(ifCard, 'otherwise');
  await addTo(otherwise, 'Say');
  const hello = otherwise.locator('.k-say input');
  await hello.fill('Hello ');
  await otherwise.locator('.k-say select.insert').selectOption('{person}');
  await expect(hello).toHaveValue('Hello {person}');
  await hello.press('End');
  await hello.pressSequentially('.');
  await expect(page.locator('#flowCounts')).toContainText('3 of 16 blocks');

  await page.fill('#try-person', 'Sat Paing');
  await page.click('#tryRun');
  await expect(page.locator('#tryAnswer')).toHaveText('Hello boss.');
  await expect(page.locator('#tryTrace li')).toHaveCount(2);

  await page.fill('#try-person', 'Aung');
  await page.click('#tryRun');
  await expect(page.locator('#tryAnswer')).toHaveText('Hello Aung.');

  await page.click('#save');
  await expect(page.locator('#shortcutModal')).toBeHidden();
  const card = page.locator('.item', { hasText: 'greet_person' });
  await expect(card.locator('.phrase-chip')).toHaveText('greet {person}');

  const asked = await request.post('/simulator/api/ask', { data: { utterance: 'Greet Aung please', context: {} } });
  const turn = (await asked.json()) as { spoken: string; trace: { tool: string; args: Record<string, unknown> } };
  expect(turn.trace).toMatchObject({ tool: 'greet_person', args: { person: 'Aung' } });
  expect(turn.spoken).toBe('Hello Aung.');

  await card.getByRole('button', { name: 'Remove' }).click();
  await confirmDialog(page).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.item', { hasText: 'greet_person' })).toHaveCount(0);
});

test('says which block a mistake is in, in words', async ({ page }) => {
  await openBuilder(page);
  await page.fill('#name', 'broken flow');
  await addTo(page.locator('#flow'), 'Say');

  await page.click('#save');

  await expect(page.locator('#shortcutNote')).toContainText('Block 1: What to say is missing');
  await page.click('#cancel');
  await confirmDialog(page).getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator('#shortcutModal')).toBeHidden();
});

test('moves and removes blocks, and offers no If three levels deep', async ({ page }) => {
  await openBuilder(page);
  const flow = page.locator('#flow');

  await addTo(flow, 'Say');
  await rootCards(page).nth(0).locator('input').first().fill('one');
  await addTo(flow, 'Say');
  await rootCards(page).nth(1).locator('input').first().fill('two');
  await rootCards(page).nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(rootCards(page).nth(0).locator('input').first()).toHaveValue('two');
  await rootCards(page).nth(0).getByRole('button', { name: 'Remove block' }).click();
  await expect(rootCards(page)).toHaveCount(1);
  await expect(rootCards(page).nth(0).locator('input').first()).toHaveValue('one');

  await addTo(flow, 'If');
  const outerThen = branch(rootCards(page).nth(1), 'then');
  await addTo(outerThen, 'If');
  const innerThen = branch(outerThen.locator(':scope > .block-list > .block-card').first(), 'then');

  await expect(outerThen.locator(':scope > .block-adder button', { hasText: /^If$/ })).toBeEnabled();
  await expect(innerThen.locator(':scope > .block-adder button', { hasText: /^If$/ })).toBeDisabled();
  await expect(innerThen.locator(':scope > .block-adder button', { hasText: /^Say$/ })).toBeEnabled();
});

test('opens a shortcut from before flows as the blocks it became', async ({ page }) => {
  await page.goto('/console/shortcuts');
  await page.locator('.item', { hasText: 'morning_brief' }).getByRole('button', { name: 'Edit' }).click();

  await expect(rootCards(page)).toHaveCount(3);
  await expect(rootCards(page).nth(2)).toHaveClass(/k-say/);
  await expect(rootCards(page).nth(2).locator('input').first()).toHaveValue('Here is your brief. {news} {health}');

  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcutModal')).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the builder, with a block inside an If, never scrolls sideways', async ({ page }) => {
    await openBuilder(page);
    await addTo(page.locator('#flow'), 'Ask');
    await addTo(page.locator('#flow'), 'If');
    await addTo(branch(rootCards(page).nth(1), 'then'), 'Say');

    const overflows = await page
      .locator('#shortcutModal .modal-body')
      .evaluate((body) => body.scrollWidth > body.clientWidth);
    expect(overflows).toBe(false);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways).toBe(false);
  });
});
