import { describe, expect, it } from 'vitest';

import { SourceUnavailableError } from '../../../src/domain/errors.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import { HttpClient } from '../../../src/infrastructure/http/http-client.js';
import type { Resolver } from '../../../src/infrastructure/http/network-guard.js';
import { TtlCache } from '../../../src/infrastructure/http/ttl-cache.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

/** Every name resolves to a public address unless the test says otherwise. */
const publicResolver: Resolver = async () => ['151.101.1.140'];

interface Call {
  url: string;
  headers: Record<string, string>;
  redirect: string | undefined;
}

function fakeFetch(routes: Record<string, () => Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
    const route = routes[url];
    if (route === undefined) return new Response('not found', { status: 404 });
    return route();
  };
  return { fetch: impl as typeof fetch, calls };
}

function client(fetchImpl: typeof fetch, over: { maxBytes?: number; allowPrivateNetwork?: boolean } = {}): HttpClient {
  return new HttpClient({
    timeoutMs: 2000,
    cache: new TtlCache(60_000),
    logger: silentLogger,
    fetch: fetchImpl,
    resolver: publicResolver,
    policy: { allowPrivateNetwork: over.allowPrivateNetwork ?? false },
    ...(over.maxBytes === undefined ? {} : { maxBytes: over.maxBytes }),
  });
}

describe('HttpClient.getText', () => {
  it('returns the body, its content type and where it came from', async () => {
    const { fetch } = fakeFetch({
      'https://feeds.example.org/news.xml': () =>
        new Response('<rss></rss>', { headers: { 'content-type': 'text/xml; charset=utf-8' } }),
    });

    const response = await client(fetch).getText('https://feeds.example.org/news.xml', 'news');

    expect(response).toEqual({
      body: '<rss></rss>',
      contentType: 'text/xml; charset=utf-8',
      url: 'https://feeds.example.org/news.xml',
    });
  });

  it('sends the headers it was given, and never lets fetch follow redirects on its own', async () => {
    const { fetch, calls } = fakeFetch({ 'https://api.example.org/items': () => new Response('[]') });

    await client(fetch).getText('https://api.example.org/items', 'api', { headers: { Authorization: 'Bearer abc' } });

    expect(calls[0]?.headers['Authorization']).toBe('Bearer abc');
    expect(calls[0]?.redirect).toBe('manual');
  });

  it('serves a second request from the cache', async () => {
    const { fetch, calls } = fakeFetch({ 'https://api.example.org/items': () => new Response('[]') });
    const http = client(fetch);

    await http.getText('https://api.example.org/items', 'api');
    await http.getText('https://api.example.org/items', 'api');

    expect(calls).toHaveLength(1);
  });

  it('keeps answers for different credentials apart', async () => {
    const { fetch, calls } = fakeFetch({ 'https://api.example.org/items': () => new Response('[]') });
    const http = client(fetch);

    await http.getText('https://api.example.org/items', 'api', { headers: { Authorization: 'Bearer one' } });
    await http.getText('https://api.example.org/items', 'api', { headers: { Authorization: 'Bearer two' } });

    expect(calls).toHaveLength(2);
  });

  it('refuses a private address before any request is made', async () => {
    const { fetch, calls } = fakeFetch({});

    await expect(client(fetch).getText('http://127.0.0.1:8765/console/api/settings', 'x')).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('follows a redirect to a safe address', async () => {
    const { fetch, calls } = fakeFetch({
      'https://example.org/feed': () => new Response(null, { status: 301, headers: { location: '/feed.xml' } }),
      'https://example.org/feed.xml': () => new Response('<rss></rss>'),
    });

    const response = await client(fetch).getText('https://example.org/feed', 'x');

    expect(response.url).toBe('https://example.org/feed.xml');
    expect(calls.map((call) => call.url)).toEqual(['https://example.org/feed', 'https://example.org/feed.xml']);
  });

  it('refuses a public address that redirects into a private network', async () => {
    const { fetch, calls } = fakeFetch({
      'https://example.org/sneaky': () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    });

    await expect(client(fetch).getText('https://example.org/sneaky', 'x')).rejects.toThrowError(/private network/);
    expect(calls).toHaveLength(1);
  });

  it('gives up on a redirect loop', async () => {
    const { fetch } = fakeFetch({
      'https://example.org/a': () =>
        new Response(null, { status: 302, headers: { location: 'https://example.org/b' } }),
      'https://example.org/b': () =>
        new Response(null, { status: 302, headers: { location: 'https://example.org/a' } }),
    });

    await expect(client(fetch).getText('https://example.org/a', 'x')).rejects.toThrowError(/redirected more than/);
  });

  it('reports a missing page as a typed error', async () => {
    const { fetch } = fakeFetch({});

    await expect(client(fetch).getText('https://example.org/missing', 'x')).rejects.toThrowError(/returned 404/);
  });

  it('refuses a body whose declared size is over the limit', async () => {
    const { fetch } = fakeFetch({
      'https://example.org/huge': () => new Response('x', { headers: { 'content-length': '99999999' } }),
    });

    await expect(client(fetch, { maxBytes: 1024 }).getText('https://example.org/huge', 'x')).rejects.toThrowError(
      /larger than/,
    );
  });

  it('stops reading a body that grows past the limit without saying so', async () => {
    const { fetch } = fakeFetch({ 'https://example.org/stream': () => new Response('y'.repeat(5000)) });

    await expect(client(fetch, { maxBytes: 1024 }).getText('https://example.org/stream', 'x')).rejects.toThrowError(
      /larger than/,
    );
  });

  it('decodes a body in the charset the server declares', async () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1
    const { fetch } = fakeFetch({
      'https://example.org/old.csv': () =>
        new Response(latin1, { headers: { 'content-type': 'text/csv; charset=iso-8859-1' } }),
    });

    const response = await client(fetch).getText('https://example.org/old.csv', 'x');

    expect(response.body).toBe('café');
  });
});
