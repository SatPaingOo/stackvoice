import { expect, type Page } from '@playwright/test';

import { installFakeSpeech } from './fake-speech';

/**
 * Shared set-up for the simulator tests: the fake speech APIs, and an ask
 * endpoint that answers instantly and records every question it was sent.
 *
 * Instant answers are deliberate. The duplicate-question bug only showed when an
 * answer finished before the browser's next recognition event arrived, so a fast
 * answer is the worst case rather than the easy one.
 */
export interface Asked {
  utterances: string[];
}

interface SpeechState {
  startCalls: number;
  startedWhileSpeaking: number;
  spoken: string[];
  speaking: boolean;
  speakMs: number;
}

interface SpeechControl {
  state: SpeechState;
  result(phrases: string[], resultIndex: number): void;
  end(): void;
  noSpeech(): void;
}

type WithSpeech = { __speech: SpeechControl };

export async function openSimulator(page: Page): Promise<Asked> {
  const asked: Asked = { utterances: [] };

  await page.addInitScript(installFakeSpeech);
  await page.route('**/simulator/api/ask', async (route) => {
    const body = route.request().postDataJSON() as { utterance: string };
    asked.utterances.push(body.utterance);
    await route.fulfill({
      json: {
        spoken: `Answer ${asked.utterances.length}.`,
        trace: { tool: 'stack_status', args: {}, latencyMs: 4, isError: false },
        context: {},
      },
    });
  });

  await page.goto('/simulator');
  return asked;
}

/** Delivers final phrases to the current recognizer, as one result event. */
export const result = (page: Page, phrases: string[], resultIndex = 0): Promise<void> =>
  page.evaluate(([p, i]) => (window as unknown as WithSpeech).__speech.result(p, i), [phrases, resultIndex] as const);

/** The browser decides the person has finished speaking. */
export const endListening = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as WithSpeech).__speech.end());

/** The browser gives up because it heard nothing. */
export const noSpeech = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as WithSpeech).__speech.noSpeech());

/** How long the fake synthesizer takes to say each answer. */
export const setSpeakMs = (page: Page, ms: number): Promise<void> =>
  page.evaluate((value) => {
    (window as unknown as WithSpeech).__speech.state.speakMs = value;
  }, ms);

export const speech = (page: Page): Promise<Omit<SpeechState, 'speakMs'>> =>
  page.evaluate(() => {
    const s = (window as unknown as WithSpeech).__speech.state;
    return {
      startCalls: s.startCalls,
      startedWhileSpeaking: s.startedWhileSpeaking,
      spoken: [...s.spoken],
      speaking: s.speaking,
    };
  });

export async function waitForStarts(page: Page, count: number, timeout = 5000): Promise<void> {
  await expect.poll(async () => (await speech(page)).startCalls, { timeout }).toBe(count);
}

export async function answered(page: Page, n: number): Promise<void> {
  await expect(page.locator('.turn.bot .bubble', { hasText: `Answer ${n}.` })).toBeVisible();
}
