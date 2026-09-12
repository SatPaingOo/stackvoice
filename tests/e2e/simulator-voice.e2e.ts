import { expect, test, type Page } from '@playwright/test';

import { answered, endListening, openSimulator, result, speech, waitForStarts } from './helpers';

/**
 * One spoken question must produce exactly one turn: one request, one bubble
 * each side, one spoken answer — however the browser chooses to deliver the
 * recognition events.
 *
 * These are the regression tests for a real report: speaking once showed the
 * question twice and answered it twice. The two browser-quirk cases below failed
 * against the code that shipped before the fix.
 */

async function pushToTalk(page: Page): Promise<void> {
  await page.locator('#mic').click();
  await waitForStarts(page, 1);
}

/** Waits for the answer, then long enough that any duplicate would have landed. */
async function settle(page: Page): Promise<void> {
  await answered(page, 1);
  await page.waitForTimeout(900);
}

async function expectOneTurn(page: Page): Promise<void> {
  await expect(page.locator('.turn.user')).toHaveCount(1);
  await expect(page.locator('.turn.bot')).toHaveCount(1);
  expect((await speech(page)).spoken).toEqual(['Answer 1.']);
}

test.describe('one spoken question is one turn', () => {
  test('a single phrase', async ({ page }) => {
    const asked = await openSimulator(page);
    await pushToTalk(page);

    await result(page, ['is my stack healthy']);
    await endListening(page);
    await settle(page);

    expect(asked.utterances).toEqual(['is my stack healthy']);
    await expectOneTurn(page);
  });

  test('a sentence Edge delivers as two result events is asked once, whole', async ({ page }) => {
    const asked = await openSimulator(page);
    await pushToTalk(page);

    await result(page, ['what is my'], 0);
    // Edge's gap between segments: long enough for an instant answer to finish.
    await page.waitForTimeout(600);
    await result(page, ['what is my', 'morning brief'], 1);
    await endListening(page);
    await settle(page);

    expect(asked.utterances).toEqual(['what is my morning brief']);
    await expectOneTurn(page);
  });

  test('a final result Chrome on Android repeats is asked once', async ({ page }) => {
    const asked = await openSimulator(page);
    await pushToTalk(page);

    await result(page, ['anything about iran'], 0);
    await page.waitForTimeout(600);
    await result(page, ['anything about iran'], 0);
    await endListening(page);
    await settle(page);

    expect(asked.utterances).toEqual(['anything about iran']);
    await expectOneTurn(page);
  });

  test('a repeat delivered as a second result is dropped, not appended', async ({ page }) => {
    const asked = await openSimulator(page);
    await pushToTalk(page);

    await result(page, ['anything about iran', 'anything about iran'], 0);
    await endListening(page);
    await settle(page);

    expect(asked.utterances).toEqual(['anything about iran']);
    await expectOneTurn(page);
  });

  test('a typed question', async ({ page }) => {
    const asked = await openSimulator(page);

    await page.locator('#say').fill('is my stack healthy');
    await page.locator('#say').press('Enter');
    await settle(page);

    expect(asked.utterances).toEqual(['is my stack healthy']);
    await expectOneTurn(page);
  });

  test('push to talk does not keep listening after it answers', async ({ page }) => {
    await openSimulator(page);
    await pushToTalk(page);

    await result(page, ['is my stack healthy']);
    await endListening(page);
    await settle(page);

    expect((await speech(page)).startCalls).toBe(1);
  });
});
