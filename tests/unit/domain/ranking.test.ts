import { describe, expect, it } from 'vitest';

import type { Item } from '../../../src/domain/item.js';
import { matchesItem, queryWords, rankItems, scoreItem } from '../../../src/domain/ranking.js';

const item = (over: Partial<Item> & Pick<Item, 'key' | 'title'>): Item => ({
  summary: null,
  date: null,
  topic: null,
  region: null,
  url: null,
  ...over,
});

const params = (over: Partial<Parameters<typeof rankItems>[1]> = {}) => ({ limit: 5, ...over });

describe('queryWords', () => {
  it('drops punctuation and one-character noise', () => {
    expect(queryWords('a gold, oil & GAS?')).toEqual(['gold', 'oil', 'gas']);
  });

  it('is empty for no query', () => {
    expect(queryWords(undefined)).toEqual([]);
  });
});

describe('matchesItem', () => {
  it('accepts an item that matches any query word, because spoken questions carry extra words', () => {
    const subject = item({ key: 'a', title: 'Gold prices rise', summary: 'oil fell' });

    expect(matchesItem(subject, params({ query: 'gold oil' }))).toBe(true);
    expect(matchesItem(subject, params({ query: 'gold copper' }))).toBe(true);
    expect(matchesItem(subject, params({ query: 'copper tin' }))).toBe(false);
  });

  it('matches at a word boundary, not mid-word', () => {
    const decoy = item({ key: 'a', title: 'Houthis claim a major advance' });

    // "ai" lives inside "claim" and "major"; substring matching would return this.
    expect(matchesItem(decoy, params({ query: 'ai' }))).toBe(false);
    expect(matchesItem(item({ key: 'b', title: 'New AI labs' }), params({ query: 'ai' }))).toBe(true);
  });

  it('lets a longer word match as a prefix, so possessives still count', () => {
    const subject = item({ key: 'a', title: "Myanmar's digital economy" });

    expect(matchesItem(subject, params({ query: 'myanmar' }))).toBe(true);
  });

  it('matches everything when there is no query', () => {
    expect(matchesItem(item({ key: 'a', title: 'Anything' }), params())).toBe(true);
  });

  it('narrows by topic and region, case-insensitively', () => {
    const subject = item({ key: 'a', title: 'T', topic: 'AI-ML', region: 'Asia' });

    expect(matchesItem(subject, params({ topic: 'ai-ml' }))).toBe(true);
    expect(matchesItem(subject, params({ region: 'asia' }))).toBe(true);
    expect(matchesItem(subject, params({ topic: 'politics' }))).toBe(false);
  });

  it('rejects a topic filter when the item has no topic', () => {
    expect(matchesItem(item({ key: 'a', title: 'T' }), params({ topic: 'ai-ml' }))).toBe(false);
  });
});

describe('scoreItem', () => {
  it('weighs a title hit above a summary hit', () => {
    const inTitle = item({ key: 'a', title: 'Myanmar floods', summary: 'nothing' });
    const inSummary = item({ key: 'b', title: 'Gemini update', summary: 'mentions Myanmar once' });

    expect(scoreItem(inTitle, params({ query: 'myanmar' }))).toBeGreaterThan(
      scoreItem(inSummary, params({ query: 'myanmar' })),
    );
  });

  it('counts a word once, even when it appears in both fields', () => {
    const both = item({ key: 'a', title: 'Myanmar', summary: 'Myanmar again' });

    expect(scoreItem(both, params({ query: 'myanmar' }))).toBe(3);
  });

  it('is zero without a query', () => {
    expect(scoreItem(item({ key: 'a', title: 'T' }), params())).toBe(0);
  });
});

describe('rankItems', () => {
  it('puts the article about the subject above one that merely mentions it', () => {
    const items = [
      item({ key: 'newer-passing-mention', title: 'Gemini video', summary: 'also Myanmar', date: '2026-09-07' }),
      item({ key: 'older-about-it', title: 'Strike on Myanmar monastery', date: '2026-08-23' }),
    ];

    expect(rankItems(items, params({ query: 'myanmar' })).map((i) => i.key)).toEqual([
      'older-about-it',
      'newer-passing-mention',
    ]);
  });

  it('falls back to newest first when relevance ties', () => {
    const items = [
      item({ key: 'old', title: 'Gold', date: '2026-01-01' }),
      item({ key: 'new', title: 'Gold', date: '2026-09-01' }),
    ];

    expect(rankItems(items, params({ query: 'gold' })).map((i) => i.key)).toEqual(['new', 'old']);
  });

  it('sorts undated entries last', () => {
    const items = [
      item({ key: 'undated', title: 'Gold' }),
      item({ key: 'dated', title: 'Gold', date: '2026-01-01' }),
    ];

    expect(rankItems(items, params({ query: 'gold' })).map((i) => i.key)).toEqual(['dated', 'undated']);
  });

  it('drops entries that match no query word at all', () => {
    const items = [
      item({ key: 'keep', title: 'Gold' }),
      item({ key: 'drop', title: 'Silver' }),
    ];

    expect(rankItems(items, params({ query: 'gold' })).map((i) => i.key)).toEqual(['keep']);
  });

  it('ranks a two-word match above a one-word match', () => {
    const items = [
      item({ key: 'one', title: 'Gold steady', date: '2026-09-10' }),
      item({ key: 'both', title: 'Gold and oil both move', date: '2026-01-01' }),
    ];

    expect(rankItems(items, params({ query: 'gold oil' })).map((i) => i.key)).toEqual(['both', 'one']);
  });
});
