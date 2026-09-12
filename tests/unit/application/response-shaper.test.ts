import { describe, expect, it } from 'vitest';

import {
  humanizeDuration,
  humanizeSince,
  listPhrase,
  shapeStackHealth,
  toSpoken,
} from '../../../src/application/response-shaper.js';
import type { AppHealth, StackHealth } from '../../../src/domain/health.js';

const app = (appId: string, ok: boolean): AppHealth => ({
  appId,
  enabled: true,
  ok,
  sources: [],
});

const health = (apps: AppHealth[]): StackHealth => ({
  ok: apps.every((a) => a.ok),
  checkedAt: '2026-09-12T10:00:00.000Z',
  version: '0.1.0',
  uptimeSeconds: 3600,
  apps,
});

describe('listPhrase', () => {
  it('returns "none" for an empty list', () => {
    expect(listPhrase([])).toBe('none');
  });

  it('joins two items with "and"', () => {
    expect(listPhrase(['library', 'markets'])).toBe('library and markets');
  });

  it('caps at three and counts the rest', () => {
    expect(listPhrase(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more');
  });
});

describe('toSpoken', () => {
  it('collapses whitespace', () => {
    expect(toSpoken('  two   words \n here ')).toBe('two words here');
  });

  it('truncates beyond the spoken-word budget', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const spoken = toSpoken(long);
    expect(spoken.split(' ')).toHaveLength(45);
    expect(spoken.endsWith('…')).toBe(true);
  });
});

describe('humanizeSince', () => {
  const now = new Date('2026-09-12T12:00:00.000Z');

  it('says "just now" under 90 seconds', () => {
    expect(humanizeSince(new Date('2026-09-12T11:59:30.000Z'), now)).toBe('just now');
  });

  it('uses hours within a day', () => {
    expect(humanizeSince(new Date('2026-09-12T09:00:00.000Z'), now)).toBe('3 hours ago');
  });

  it('says "yesterday" for one day', () => {
    expect(humanizeSince(new Date('2026-09-11T12:00:00.000Z'), now)).toBe('yesterday');
  });

  it('never leaks an ISO timestamp', () => {
    expect(humanizeSince(new Date('2026-09-01T12:00:00.000Z'), now)).not.toMatch(/\d{4}-\d{2}/);
  });
});

describe('humanizeDuration', () => {
  it('reads an hour as words, not seconds', () => {
    expect(humanizeDuration(3600)).toBe('1 hour');
  });
});

describe('shapeStackHealth', () => {
  it('explains the empty stack instead of returning an empty list', () => {
    const spoken = shapeStackHealth(health([]));
    expect(spoken).toContain('No apps are configured yet');
    expect(spoken).toContain('1 hour');
  });

  it('leads with the good news when everything is healthy', () => {
    expect(shapeStackHealth(health([app('library', true), app('markets', true)]))).toBe(
      'Your stack is healthy. 2 apps are running: library and markets.',
    );
  });

  it('leads with the failure when something is broken', () => {
    const spoken = shapeStackHealth(health([app('library', false), app('markets', true)]));
    expect(spoken).toBe('1 app has a problem: library. The other one is fine.');
  });

  it('says "1 app is running", not "1 apps are running"', () => {
    expect(shapeStackHealth(health([app('library', true)]))).toBe(
      'Your stack is healthy. 1 app is running: library.',
    );
  });

  it('does not claim other apps are fine when none are', () => {
    expect(shapeStackHealth(health([app('library', false)]))).toBe('1 app has a problem: library.');
  });

  it('stays inside the spoken-word budget for a large stack', () => {
    const apps = Array.from({ length: 30 }, (_, i) => app(`app-${i}`, true));
    expect(shapeStackHealth(health(apps)).split(' ').length).toBeLessThanOrEqual(45);
  });
});
