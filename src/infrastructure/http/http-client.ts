import { createHash } from 'node:crypto';

import { SourceUnavailableError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import { assertFetchable, type NetworkPolicy, type Resolver } from './network-guard.js';
import { redactUrl } from './redact-url.js';
import { TtlCache } from './ttl-cache.js';

/**
 * The one method the GitHub adapter needs. Separate from `HttpClient` so adapter
 * tests can supply fixtures instead of a network (Interface Segregation).
 */
export interface JsonFetcher {
  getJson<T>(url: string, sourceId: string): Promise<T>;
}

export interface TextRequestOptions {
  /** Already resolved: secret references must be replaced before they get here. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface TextResponse {
  readonly body: string;
  readonly contentType: string | null;
  /** Where the body actually came from, after any redirects. */
  readonly url: string;
}

/** What the url adapter and inspector need: any body, from any public address. */
export interface TextFetcher {
  getText(url: string, sourceId: string, options?: TextRequestOptions): Promise<TextResponse>;
}

export interface HttpClientOptions {
  readonly timeoutMs: number;
  readonly cache: TtlCache;
  readonly logger: Logger;
  readonly policy?: NetworkPolicy;
  /** Largest body read for a text source. Atom feeds of busy projects pass 700 KB. */
  readonly maxBytes?: number;
  readonly resolver?: Resolver;
  /** Injected in tests. */
  readonly fetch?: typeof fetch;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const TEXT_ACCEPT =
  'application/json, application/rss+xml, application/atom+xml, text/csv, text/xml;q=0.9, text/plain;q=0.8, */*;q=0.5';

/**
 * Fetch wrapper for the adapters: timeout, one retry, shared TTL cache.
 *
 * Every external failure is wrapped into a typed domain error here, so no raw
 * fetch or parse error ever escapes the infrastructure layer.
 */
export class HttpClient implements JsonFetcher, TextFetcher {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * GETs JSON from a fixed, known host. Used only for GitHub, whose addresses are
   * built by the adapter rather than typed by a person, so it follows redirects.
   */
  async getJson<T>(url: string, sourceId: string): Promise<T> {
    return this.options.cache.resolve(url, async () => {
      const started = Date.now();
      const response = await this.fetchWithRetry(url, sourceId, { accept: 'application/json' }, 'follow');

      if (!response.ok) {
        throw new SourceUnavailableError(sourceId, `${redactUrl(url)} returned ${response.status}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new SourceUnavailableError(sourceId, `${redactUrl(url)} did not return valid JSON`, { cause });
      }

      this.options.logger.debug('fetched', { url: redactUrl(url), sourceId, ms: Date.now() - started });
      return body as T;
    });
  }

  /**
   * GETs any body from an address a person supplied.
   *
   * Redirects are followed by hand, one hop at a time, and the network guard runs
   * on every hop. Letting fetch follow them would check only the first address,
   * and a public address that redirects to 169.254.169.254 would sail through.
   */
  async getText(url: string, sourceId: string, options: TextRequestOptions = {}): Promise<TextResponse> {
    const headers = options.headers ?? {};
    // Different credentials can mean different answers, so they are part of the key.
    const key = `text ${url} ${fingerprint(headers)}`;

    return this.options.cache.resolve(key, async () => {
      const started = Date.now();
      const policy = this.options.policy ?? { allowPrivateNetwork: false };
      let current = url;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        await assertFetchable(current, sourceId, policy, this.options.resolver);
        const response = await this.fetchWithRetry(current, sourceId, { accept: TEXT_ACCEPT, ...headers }, 'manual');

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location === null) {
            throw new SourceUnavailableError(sourceId, `${redactUrl(current)} redirected without saying where to`);
          }
          current = new URL(location, current).toString();
          continue;
        }

        if (!response.ok) {
          throw new SourceUnavailableError(sourceId, `${redactUrl(current)} returned ${response.status}`);
        }

        const body = await this.readCapped(response, current, sourceId);
        this.options.logger.debug('fetched', { url: redactUrl(current), sourceId, ms: Date.now() - started });
        return { body, contentType: response.headers.get('content-type'), url: current };
      }

      throw new SourceUnavailableError(sourceId, `${redactUrl(url)} redirected more than ${MAX_REDIRECTS} times`);
    });
  }

  private async readCapped(response: Response, url: string, sourceId: string): Promise<string> {
    const limit = this.options.maxBytes ?? DEFAULT_MAX_BYTES;
    const tooLarge = (): SourceUnavailableError =>
      new SourceUnavailableError(sourceId, `${redactUrl(url)} is larger than ${Math.round(limit / 1024 / 1024)} MB`);

    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) throw tooLarge();
    if (response.body === null) return '';

    // Counted while streaming, because content-length is optional and can lie.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }

    return decode(Buffer.concat(chunks), response.headers.get('content-type'));
  }

  private async fetchWithRetry(
    url: string,
    sourceId: string,
    headers: Record<string, string>,
    // Named literally: RequestRedirect is a DOM type and this is Node.
    redirect: 'follow' | 'manual',
  ): Promise<Response> {
    let lastCause: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.options.timeoutMs),
          headers: { 'user-agent': 'stackvoice', ...headers },
          redirect,
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

    throw new SourceUnavailableError(sourceId, `could not reach ${redactUrl(url)}`, { cause: lastCause });
  }
}

/** Decodes with the charset the server declared, falling back to UTF-8. */
function decode(bytes: Buffer, contentType: string | null): string {
  const charset = /charset=([^;]+)/i
    .exec(contentType ?? '')?.[1]
    ?.trim()
    .replace(/"/g, '');
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function fingerprint(headers: Readonly<Record<string, string>>): string {
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '-';
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
}
