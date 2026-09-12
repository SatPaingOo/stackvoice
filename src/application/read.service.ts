import type { Item } from '../domain/item.js';
import type { DataSourceReaderFactory } from '../domain/ports/data-source-reader.js';
import type { AppRegistryService } from './app-registry.service.js';

/** Runs the read verb against an app's source. */
export class ReadService {
  constructor(
    private readonly registry: AppRegistryService,
    private readonly readers: DataSourceReaderFactory,
  ) {}

  /** Resolves to null when no entry has that key. */
  async read(appId: string, key: string): Promise<Item | null> {
    const app = this.registry.get(appId);
    const source = app.primarySource();
    return this.readers.forSource(source).read(source, key);
  }
}
