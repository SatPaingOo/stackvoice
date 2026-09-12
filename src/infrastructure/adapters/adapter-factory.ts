import type { DataSource } from '../../domain/data-source.js';
import { ValidationError } from '../../domain/errors.js';
import type { DataSourceReader, DataSourceReaderFactory } from '../../domain/ports/data-source-reader.js';

/**
 * Resolves a source type to its reader.
 *
 * A new source type (`json-url`, `rss`) is a new adapter plus one entry in this
 * map. No service, no catalog and no registry changes — that is the Open/Closed
 * claim made concrete.
 */
export class ReaderFactory implements DataSourceReaderFactory {
  constructor(private readonly readers: ReadonlyMap<string, DataSourceReader>) {}

  forSource(source: DataSource): DataSourceReader {
    const reader = this.readers.get(source.type);
    if (reader === undefined) {
      throw new ValidationError(`no reader is registered for source type "${source.type}"`, `sources.${source.id}.type`);
    }
    return reader;
  }
}
