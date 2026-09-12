import { describe, expect, it } from 'vitest';

import { TtlCache } from '../../../src/infrastructure/http/ttl-cache.js';

/** A clock the test moves by hand, so nothing sleeps. */
class FakeClock {
  private ms = 0;
  now = (): number => this.ms;
  advance(by: number): void {
    this.ms += by;
  }
}

describe('TtlCache', () => {
  it('serves a value back inside the TTL', () => {
    const cache = new TtlCache(1000, new FakeClock().now);
    cache.set('k', 42);

    expect(cache.get<number>('k')).toBe(42);
  });

  it('expires a value once the TTL passes', () => {
    const clock = new FakeClock();
    const cache = new TtlCache(1000, clock.now);
    cache.set('k', 42);

    clock.advance(1001);

    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('computes only once while the entry stays warm', async () => {
    const cache = new TtlCache(1000, new FakeClock().now);
    let calls = 0;
    const compute = async (): Promise<string> => {
      calls += 1;
      return 'value';
    };

    await cache.resolve('k', compute);
    await cache.resolve('k', compute);

    expect(calls).toBe(1);
  });

  it('recomputes after expiry', async () => {
    const clock = new FakeClock();
    const cache = new TtlCache(1000, clock.now);
    let calls = 0;
    const compute = async (): Promise<number> => {
      calls += 1;
      return calls;
    };

    expect(await cache.resolve('k', compute)).toBe(1);
    clock.advance(1500);
    expect(await cache.resolve('k', compute)).toBe(2);
  });

  it('keeps keys apart', () => {
    const cache = new TtlCache(1000, new FakeClock().now);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });
});
