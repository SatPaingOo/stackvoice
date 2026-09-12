/**
 * Per-key in-memory cache with a TTL.
 *
 * This is what keeps tool calls inside the Alexa+ 500 ms round-trip budget and
 * inside GitHub's 60 requests/hour unauthenticated limit: a warm entry is
 * served without touching the network.
 */
interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Returns the cached value, or computes, stores and returns a fresh one. */
  async resolve<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    this.set(key, value);
    return value;
  }

  get size(): number {
    return this.entries.size;
  }
}
