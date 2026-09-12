import type { DataSource } from '../data-source.js';
import type { SourceHealth } from '../health.js';
import type { Item, SearchParams } from '../item.js';

/**
 * The read verbs a source type supports. Every implementation returns the same
 * shapes and the same error semantics, so callers depend on this port and never
 * on a particular source type.
 *
 * @throws {SourceUnavailableError} when the underlying source cannot be read.
 */
export interface DataSourceReader {
  search(source: DataSource, params: SearchParams): Promise<readonly Item[]>;
  read(source: DataSource, key: string): Promise<Item | null>;
  status(source: DataSource): Promise<SourceHealth>;
}

/** Resolves a source to the reader that can serve it (Factory). */
export interface DataSourceReaderFactory {
  /** @throws {ValidationError} when no reader handles the source type. */
  forSource(source: DataSource): DataSourceReader;
}
