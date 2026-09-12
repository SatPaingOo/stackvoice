import type { Item, SearchParams } from '../domain/item.js';
import { SEARCH_LIMIT_MAX } from '../domain/item.js';
import type { DataSourceReaderFactory } from '../domain/ports/data-source-reader.js';
import type { AppRegistryService } from './app-registry.service.js';

/** Runs the search verb against an app's source. */
export class SearchService {
  constructor(
    private readonly registry: AppRegistryService,
    private readonly readers: DataSourceReaderFactory,
  ) {}

  /** @throws {AppNotFoundError} @throws {SourceUnavailableError} */
  async search(appId: string, params: SearchParams): Promise<readonly Item[]> {
    const app = this.registry.get(appId);
    const source = app.primarySource();
    const limit = Math.min(Math.max(1, params.limit), SEARCH_LIMIT_MAX);
    return this.readers.forSource(source).search(source, { ...params, limit });
  }
}
