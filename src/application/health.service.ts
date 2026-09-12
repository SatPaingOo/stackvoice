import type { StackHealth } from '../domain/health.js';

/** Wall-clock source, injected so tests are deterministic. */
export interface Clock {
  now(): Date;
  /** Seconds since the process started. */
  uptimeSeconds(): number;
}

/**
 * Produces the stack-wide health payload behind `stack_status`.
 *
 * Stage 1 reports the server only; `apps` stays empty until the app registry
 * lands in Stage 2, at which point this service aggregates per-app health
 * without its callers changing.
 */
export class HealthService {
  constructor(
    private readonly version: string,
    private readonly clock: Clock,
  ) {}

  reportStack(): StackHealth {
    return {
      ok: true,
      checkedAt: this.clock.now().toISOString(),
      version: this.version,
      uptimeSeconds: Math.round(this.clock.uptimeSeconds()),
      apps: [],
    };
  }
}
