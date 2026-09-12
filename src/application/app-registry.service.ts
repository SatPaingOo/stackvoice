import type { AppDefinition } from '../domain/app-definition.js';
import { AppNotFoundError } from '../domain/errors.js';
import type { ConfigStore } from '../domain/ports/config-store.js';
import type { Logger } from '../domain/ports/logger.js';

/**
 * Loads and indexes the configured apps once at startup.
 *
 * Config is read at boot, not per request: a tool call must never wait on the
 * filesystem. Management mutations (Stage 4) go through the same store and ask
 * for a reload.
 */
export class AppRegistryService {
  private apps: readonly AppDefinition[] = [];
  private byId = new Map<string, AppDefinition>();

  constructor(
    private readonly store: ConfigStore,
    private readonly logger: Logger,
  ) {}

  /** @throws {ConfigError} naming the offending file; the server must not boot past this. */
  async load(): Promise<void> {
    this.apps = await this.store.listApps();
    this.byId = new Map(this.apps.map((app) => [app.id, app]));
    this.logger.info('apps loaded', {
      count: this.apps.length,
      enabled: this.listEnabled().map((app) => app.id),
    });
  }

  list(): readonly AppDefinition[] {
    return this.apps;
  }

  listEnabled(): readonly AppDefinition[] {
    return this.apps.filter((app) => app.enabled);
  }

  /** @throws {AppNotFoundError} when the id is unknown or the app is disabled. */
  get(id: string): AppDefinition {
    const app = this.byId.get(id);
    if (app === undefined || !app.enabled) throw new AppNotFoundError(id);
    return app;
  }
}
