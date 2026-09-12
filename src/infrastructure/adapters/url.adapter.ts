import type { DataSource } from '../../domain/data-source.js';
import { SourceUnavailableError, ValidationError } from '../../domain/errors.js';
import type { SourceHealth } from '../../domain/health.js';
import type { Item, SearchParams } from '../../domain/item.js';
import type { DataSourceReader } from '../../domain/ports/data-source-reader.js';
import type { SecretStore } from '../../domain/ports/secret-store.js';
import { rankItems } from '../../domain/ranking.js';
import { resolveHeaders } from '../config/secret-headers.js';
import { ParseError, parseBody } from '../formats/parse.js';
import type { TextFetcher } from '../http/http-client.js';
import { readDataFile } from './data-file.js';
import { readPath } from './dot-path.js';
import { newestDate, toItem } from './records.js';

export interface UrlSourceReaderOptions {
  readonly http: TextFetcher;
  readonly secrets: SecretStore;
  /** Absolute. File sources resolve inside it and nowhere else. */
  readonly dataDir: string;
}

/**
 * Reads url and file sources: any JSON, RSS, Atom or CSV, from an address or
 * from the data directory.
 *
 * GitHub sources keep their own adapter because they carry a second signal, the
 * Actions run history. Everything else is "get a body, parse it, read the
 * records", which is the same whether the body came over HTTP or off a disk.
 */
export class UrlSourceReader implements DataSourceReader {
  constructor(private readonly options: UrlSourceReaderOptions) {}

  async search(source: DataSource, params: SearchParams): Promise<readonly Item[]> {
    const items = await this.loadItems(source);
    return rankItems(items, params).slice(0, params.limit);
  }

  async read(source: DataSource, key: string): Promise<Item | null> {
    const items = await this.loadItems(source);
    const wanted = key.trim().toLowerCase();
    return items.find((item) => item.key.toLowerCase() === wanted) ?? null;
  }

  async status(source: DataSource): Promise<SourceHealth> {
    const started = Date.now();
    try {
      const items = await this.loadItems(source);
      // There is no run history to consult: a source that answers with records is healthy.
      return {
        sourceId: source.id,
        ok: true,
        lastRunAt: null,
        lastDataDate: newestDate(items),
        itemCount: items.length,
        latencyMs: Date.now() - started,
        lastError: null,
      };
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        return {
          sourceId: source.id,
          ok: false,
          lastRunAt: null,
          lastDataDate: null,
          itemCount: null,
          latencyMs: Date.now() - started,
          lastError: error.message,
        };
      }
      throw error;
    }
  }

  private async loadItems(source: DataSource): Promise<readonly Item[]> {
    const { location } = source;
    let body: string;

    if (location.type === 'url') {
      const headers = await resolveHeaders(location.headers, this.options.secrets, source.id);
      body = (await this.options.http.getText(location.url, source.id, { headers })).body;
    } else if (location.type === 'file') {
      body = await readDataFile(this.options.dataDir, location.path, source.id);
    } else {
      throw new ValidationError(
        `${source.id} is a ${location.type} source, which this reader does not handle`,
        `sources.${source.id}.type`,
      );
    }

    let document: unknown;
    try {
      document = parseBody(body, location.format);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new SourceUnavailableError(source.id, `${source.describe()}: ${error.message}`, { cause: error });
      }
      throw error;
    }

    const raw = source.itemsPath === null ? document : readPath(document, source.itemsPath);
    if (!Array.isArray(raw)) {
      const where = source.itemsPath === null ? '' : ` at "${source.itemsPath}"`;
      throw new SourceUnavailableError(source.id, `${source.describe()} has no list of records${where}`);
    }

    return raw.map((entry) => toItem(entry, source.fields)).filter((item): item is Item => item !== null);
  }
}
