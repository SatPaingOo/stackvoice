import { SourceUnavailableError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import { TtlCache } from './ttl-cache.js';

/**
 * The one method the adapters need. Keeping it separate from `HttpClient` lets
 * adapter tests supply fixtures instead of a network (Interface Segregation).
 */
export interface JsonFetcher {
  getJson<T>(url: string, sourceId: string): Promise<T>;
}

export interface HttpClientOptions {
  readonly timeoutMs: number;
  readonly cache: TtlCache;
  readonly logger: Logger;
}

/**
 * Fetch wrapper for the adapters: timeout, one retry, shared TTL cache.
 *
 * Every external failure is wrapped into a typed domain error here, so no raw
 * fetch or JSON error ever escapes the infrastructure layer.
 */
export class HttpClient implements JsonFetcher {
  constructor(private readonly options: HttpClientOptions) {}

  /** GETs JSON, serving a cached copy when one is warm. */
  async getJson<T>(url: string, sourceId: string): Promise<T> {
    return this.options.cache.resolve(url, async () => {
      const started = Date.now();
      const response = await this.fetchWithRetry(url, sourceId);

      if (!response.ok) {
        throw new SourceUnavailableError(sourceId, `${url} returned ${response.status}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new SourceUnavailableError(sourceId, `${url} did not return valid JSON`, { cause });
      }

      this.options.logger.debug('fetched', { url, sourceId, ms: Date.now() - started });
      return body as T;
    });
  }

  private async fetchWithRetry(url: string, sourceId: string): Promise<Response> {
    let lastCause: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.options.timeoutMs),
          headers: { accept: 'application/json', 'user-agent': 'stackvoice' },
        });
        // Retry a server-side failure once; a 404 is an answer, not a hiccup.
        if (response.status >= 500 && attempt === 0) {
          lastCause = new Error(`status ${response.status}`);
          continue;
        }
        return response;
      } catch (cause) {
        lastCause = cause;
      }
    }

    throw new SourceUnavailableError(sourceId, `could not reach ${url}`, { cause: lastCause });
  }
}
