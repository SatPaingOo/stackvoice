import type { StackHealth } from '../domain/health.js';
import type { AppRegistryService } from './app-registry.service.js';
import type { StatusService } from './status.service.js';

/** Wall-clock source, injected so tests are deterministic. */
export interface Clock {
  now(): Date;
  /** Seconds since the process started. */
  uptimeSeconds(): number;
}

/**
 * Produces the stack-wide health payload behind `stack_status`, by aggregating
 * the per-app reports the `{id}_status` tools return. One shape, several
 * renderings (spoken, JSON, and the management table in Stage 4).
 */
export class HealthService {
  constructor(
    private readonly version: string,
    private readonly clock: Clock,
    private readonly registry: AppRegistryService,
    private readonly status: StatusService,
  ) {}

  async reportStack(): Promise<StackHealth> {
    const apps = await Promise.all(
      this.registry.listEnabled().map((app) => this.status.report(app)),
    );

    return {
      ok: apps.every((app) => app.ok),
      checkedAt: this.clock.now().toISOString(),
      version: this.version,
      uptimeSeconds: Math.round(this.clock.uptimeSeconds()),
      apps,
    };
  }
}
