export interface AttemptLimiterOptions {
  /** Wrong secrets an address may send in one window before it is locked out. */
  readonly maxFailures: number;
  /** How long a window lasts, counted from the first wrong secret in it. */
  readonly windowMs: number;
  readonly now?: () => number;
}

interface Failures {
  count: number;
  readonly since: number;
}

// Each address costs a few bytes, but a guesser with many addresses could still
// grow the map without end. Past this size the oldest entries go first.
const MAX_TRACKED = 10_000;

/**
 * Counts wrong owner tokens per client address, and locks an address out once it
 * has guessed too often.
 *
 * One instance guards every door that takes the owner token: console sign-in,
 * the shared token on `/mcp`, and the OAuth consent page. Separate counters would
 * give a guesser three times the attempts. A lockout refuses even the right
 * token, because otherwise the answer to the next guess would still tell a
 * guesser when they had found it.
 *
 * In memory, like the sessions and OAuth tokens: a restart forgets it.
 */
export class AttemptLimiter {
  private readonly failures = new Map<string, Failures>();
  private readonly now: () => number;

  constructor(private readonly options: AttemptLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  /** How long the address must wait before trying again; 0 when it may try now. */
  retryAfterMs(address: string): number {
    const entry = this.failures.get(address);
    if (entry === undefined) return 0;

    const endsAt = entry.since + this.options.windowMs;
    const now = this.now();
    if (endsAt <= now) {
      this.failures.delete(address);
      return 0;
    }
    return entry.count >= this.options.maxFailures ? endsAt - now : 0;
  }

  recordFailure(address: string): void {
    const now = this.now();
    const entry = this.failures.get(address);
    if (entry !== undefined && entry.since + this.options.windowMs > now) {
      entry.count += 1;
      return;
    }

    this.failures.delete(address);
    if (this.failures.size >= MAX_TRACKED) this.makeRoom(now);
    this.failures.set(address, { count: 1, since: now });
  }

  /** The right token clears the address's count. */
  recordSuccess(address: string): void {
    this.failures.delete(address);
  }

  /** Drops finished windows, then the oldest entries if that was not enough. */
  private makeRoom(now: number): void {
    for (const [address, entry] of this.failures) {
      if (entry.since + this.options.windowMs <= now) this.failures.delete(address);
    }
    for (const address of this.failures.keys()) {
      if (this.failures.size < MAX_TRACKED) break;
      this.failures.delete(address);
    }
  }
}

/** What a locked-out client is told, in whole minutes. */
export function describeLockout(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
  return `Too many wrong tokens from this address. Try again in ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`;
}

/** The value of a `Retry-After` header, in whole seconds. */
export function retryAfterSeconds(waitMs: number): string {
  return String(Math.max(1, Math.ceil(waitMs / 1000)));
}
