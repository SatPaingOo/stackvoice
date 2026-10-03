import { describe, expect, it } from 'vitest';

import {
  AttemptLimiter,
  describeLockout,
  retryAfterSeconds,
} from '../../../src/infrastructure/auth/attempt-limiter.js';

const WINDOW_MS = 15 * 60 * 1000;

/** A limiter on a clock the test moves by hand. */
function limiter(maxFailures = 3): { limiter: AttemptLimiter; advance(ms: number): void } {
  let now = 1_000_000;
  return {
    limiter: new AttemptLimiter({ maxFailures, windowMs: WINDOW_MS, now: () => now }),
    advance: (ms) => {
      now += ms;
    },
  };
}

describe('AttemptLimiter', () => {
  it('lets an address with no failures try', () => {
    expect(limiter().limiter.retryAfterMs('203.0.113.7')).toBe(0);
  });

  it('lets an address try until it reaches the limit', () => {
    const { limiter: attempts } = limiter();
    attempts.recordFailure('203.0.113.7');
    attempts.recordFailure('203.0.113.7');

    expect(attempts.retryAfterMs('203.0.113.7')).toBe(0);
  });

  it('locks the address out at the limit, until the window that began with its first failure ends', () => {
    const { limiter: attempts, advance } = limiter();
    attempts.recordFailure('203.0.113.7');
    advance(60_000);
    attempts.recordFailure('203.0.113.7');
    attempts.recordFailure('203.0.113.7');

    expect(attempts.retryAfterMs('203.0.113.7')).toBe(WINDOW_MS - 60_000);
  });

  it('forgets the failures once the window has passed', () => {
    const { limiter: attempts, advance } = limiter();
    for (let i = 0; i < 3; i += 1) attempts.recordFailure('203.0.113.7');

    advance(WINDOW_MS);

    expect(attempts.retryAfterMs('203.0.113.7')).toBe(0);
    attempts.recordFailure('203.0.113.7');
    expect(attempts.retryAfterMs('203.0.113.7')).toBe(0);
  });

  it('counts each address on its own', () => {
    const { limiter: attempts } = limiter();
    for (let i = 0; i < 3; i += 1) attempts.recordFailure('203.0.113.7');

    expect(attempts.retryAfterMs('198.51.100.20')).toBe(0);
  });

  it('clears an address on success', () => {
    const { limiter: attempts } = limiter();
    attempts.recordFailure('203.0.113.7');
    attempts.recordFailure('203.0.113.7');
    attempts.recordSuccess('203.0.113.7');
    attempts.recordFailure('203.0.113.7');
    attempts.recordFailure('203.0.113.7');

    expect(attempts.retryAfterMs('203.0.113.7')).toBe(0);
  });

  it('keeps working when more addresses fail than it tracks', () => {
    const { limiter: attempts } = limiter(1);
    for (let i = 0; i < 10_050; i += 1) attempts.recordFailure(`10.0.${String(i >> 8)}.${String(i & 255)}`);

    // The newest address is still locked out; the oldest made room for it.
    expect(attempts.retryAfterMs('10.0.39.65')).toBeGreaterThan(0);
    expect(attempts.retryAfterMs('10.0.0.0')).toBe(0);
  });
});

describe('describeLockout', () => {
  it('rounds the wait up to whole minutes', () => {
    expect(describeLockout(14 * 60_000 + 1)).toBe('Too many wrong tokens from this address. Try again in 15 minutes.');
  });

  it('never says zero minutes', () => {
    expect(describeLockout(500)).toBe('Too many wrong tokens from this address. Try again in 1 minute.');
  });
});

describe('retryAfterSeconds', () => {
  it('rounds up to whole seconds, and never to 0', () => {
    expect(retryAfterSeconds(1500)).toBe('2');
    expect(retryAfterSeconds(1)).toBe('1');
  });
});
