import { expect, test, type Page } from '@playwright/test';

import {
  answered,
  endListening,
  noSpeech,
  openSimulator,
  result,
  setSpeakMs,
  speech,
  waitForStarts,
} from './helpers';

/**
 * Conversation mode: listen, answer out loud, listen again, until the person
 * says stop, goes quiet, or taps the button.
 *
 * The property that matters most is `startedWhileSpeaking`: a microphone opened
 * while the answer is still playing hears the answer and sends it back as the
 * next question, which is the loop from hell for anyone demoing this out loud.
 */

const talk = (page: Page) => page.locator('#talk');

async function startConversation(page: Page): Promise<void> {
  await talk(page).click();
  await waitForStarts(page, 1);
  await expect(talk(page)).toHaveAttribute('aria-pressed', 'true');
}

async function say(page: Page, words: string): Promise<void> {
  await result(page, [words]);
  await endListening(page);
}

test.describe('conversation mode', () => {
  test('listens, answers out loud, then listens again by itself', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    await say(page, 'is my stack healthy');
    await answered(page, 1);
    await waitForStarts(page, 2);

    await say(page, 'anything about iran');
    await answered(page, 2);
    await waitForStarts(page, 3);

    expect(asked.utterances).toEqual(['is my stack healthy', 'anything about iran']);
    await expect(page.locator('.turn.user')).toHaveCount(2);
    await expect(page.locator('.turn.bot')).toHaveCount(2);

    const state = await speech(page);
    expect(state.spoken).toEqual(['Answer 1.', 'Answer 2.']);
    expect(state.startedWhileSpeaking).toBe(0);
  });

  test('never opens the microphone while it is still speaking', async ({ page }) => {
    await openSimulator(page);
    await setSpeakMs(page, 1600);
    await startConversation(page);

    await say(page, 'is my stack healthy');
    await answered(page, 1);
    await expect.poll(async () => (await speech(page)).speaking).toBe(true);

    // Well into the answer: still exactly one listening session.
    await page.waitForTimeout(900);
    expect((await speech(page)).startCalls).toBe(1);

    // And it does come back once the answer is over.
    await waitForStarts(page, 2);
    expect((await speech(page)).startedWhileSpeaking).toBe(0);
  });

  test('saying stop ends it, without sending "stop" to the server', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    await say(page, 'is my stack healthy');
    await answered(page, 1);
    await waitForStarts(page, 2);

    await say(page, 'Stop.');
    await page.waitForTimeout(1200);

    expect(asked.utterances).toEqual(['is my stack healthy']);
    expect((await speech(page)).startCalls).toBe(2);
    await expect(talk(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(talk(page)).toHaveText('Start a conversation');
  });

  test('two silences in a row end it and say why', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    await noSpeech(page);
    await waitForStarts(page, 2);
    await noSpeech(page);
    await page.waitForTimeout(900);

    expect(asked.utterances).toEqual([]);
    expect((await speech(page)).startCalls).toBe(2);
    await expect(talk(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#status')).toContainText('did not hear anything');
  });

  test('one silence does not end it', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    await noSpeech(page);
    await waitForStarts(page, 2);
    await say(page, 'is my stack healthy');
    await answered(page, 1);

    expect(asked.utterances).toEqual(['is my stack healthy']);
    await expect(talk(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('tapping the circle while it speaks interrupts and listens', async ({ page }) => {
    await openSimulator(page);
    await setSpeakMs(page, 5000);
    await startConversation(page);

    await say(page, 'is my stack healthy');
    await answered(page, 1);
    await expect.poll(async () => (await speech(page)).speaking).toBe(true);

    await page.locator('#orb').click();
    await waitForStarts(page, 2);

    const state = await speech(page);
    expect(state.speaking).toBe(false);
    expect(state.startedWhileSpeaking).toBe(0);
    expect(state.spoken).toEqual(['Answer 1.']);
  });

  test('ending it mid-sentence sends nothing', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    await result(page, ['half a sentence']);
    await talk(page).click();
    await page.waitForTimeout(900);

    expect(asked.utterances).toEqual([]);
    await expect(page.locator('.turn.user')).toHaveCount(0);
    await expect(talk(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#status')).toHaveText('Conversation ended.');
  });

  test('each spoken question is still asked exactly once', async ({ page }) => {
    const asked = await openSimulator(page);
    await startConversation(page);

    // The Edge split, inside a conversation.
    await result(page, ['what is my'], 0);
    await page.waitForTimeout(600);
    await result(page, ['what is my', 'morning brief'], 1);
    await endListening(page);
    await answered(page, 1);
    await waitForStarts(page, 2);

    expect(asked.utterances).toEqual(['what is my morning brief']);
    await expect(page.locator('.turn.user')).toHaveCount(1);
  });
});
