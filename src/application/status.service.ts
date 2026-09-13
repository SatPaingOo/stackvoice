import type { AppDefinition } from '../domain/app-definition.js';
import type { AppHealth } from '../domain/health.js';
import type { DataSourceReaderFactory } from '../domain/ports/data-source-reader.js';
import type { AppRegistryService } from './app-registry.service.js';

/** Runs the status verb for one app, across all of its sources. */
export class StatusService {
  constructor(
    private readonly registry: AppRegistryService,
    private readonly readers: DataSourceReaderFactory,
  ) {}

  async statusOf(appId: string): Promise<AppHealth> {
    return this.report(this.registry.get(appId));
  }

  async report(app: AppDefinition): Promise<AppHealth> {
    const sources = await Promise.all(app.sources.map((source) => this.readers.forSource(source).status(source)));

    return {
      appId: app.id,
      enabled: app.enabled,
      ok: sources.every((source) => source.ok),
      sources,
    };
  }
}
