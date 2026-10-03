import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import type { Settings } from '../../../src/domain/settings.js';
import { AttemptLimiter } from '../../../src/infrastructure/auth/attempt-limiter.js';
import { createHttpServer, type HttpServerDeps } from '../../../src/presentation/mcp/http-server.js';

/**
 * The shared token on `/mcp` in `token` mode. A request that gets past the guard
 * without a session answers 400, so 400 here means "let in".
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const TOKEN = 'owner-secret';

const settings = (trustedProxies: number): Settings => ({
  server: { host: '127.0.0.1', port: 0, logLevel: 'warn', trustedProxies },
  management: { cli: true },
  auth: { mode: 'token', token: TOKEN, publicUrl: '' },
  console: { enabled: false },
  simulator: { enabled: false },
  sources: { allowPrivateNetwork: false, dataDir: 'data' },
  cache: { ttlSeconds: 300 },
});

let server: Server | null = null;

afterEach(async () => {
  const running = server;
  server = null;
  if (running !== null) await new Promise<void>((resolve) => running.close(() => resolve()));
});

/** Starts the server; the limiter allows three wrong tokens per address. */
async function start(trustedProxies = 0): Promise<string> {
  const deps = {
    version: 'test',
    logger: silentLogger,
    settings: settings(trustedProxies),
    simulator: null,
    console: null,
    attempts: new AttemptLimiter({ maxFailures: 3, windowMs: 60_000 }),
  } as unknown as HttpServerDeps;
  server = await createHttpServer(deps).listen();
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/mcp`;
}

function post(url: string, headers: Record<string, string> = {}): Promise<globalThis.Response> {
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

describe('/mcp with a shared token', () => {
  it('lets the right token in', async () => {
    const url = await start();

    expect((await post(url, bearer(TOKEN))).status).toBe(400);
  });

  it('refuses a wrong token with a bearer challenge', async () => {
    const url = await start();

    const response = await post(url, bearer('guess'));

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('locks the address out after too many wrong tokens, even for the right one', async () => {
    const url = await start();
    for (const guess of ['one', 'two', 'three']) expect((await post(url, bearer(guess))).status).toBe(401);

    const locked = await post(url, bearer(TOKEN));

    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('does not count a request with no token, which is how a client learns it needs one', async () => {
    const url = await start();
    for (let i = 0; i < 5; i += 1) expect((await post(url)).status).toBe(401);

    expect((await post(url, bearer(TOKEN))).status).toBe(400);
  });

  it('ignores X-Forwarded-For when no proxy is trusted, so a guesser cannot pick a new address', async () => {
    const url = await start(0);
    for (const [i, guess] of ['one', 'two', 'three'].entries()) {
      await post(url, { ...bearer(guess), 'x-forwarded-for': `198.51.100.${String(i)}` });
    }

    expect((await post(url, { ...bearer(TOKEN), 'x-forwarded-for': '198.51.100.99' })).status).toBe(429);
  });

  it('counts the forwarded address when a proxy is trusted, so one guesser does not lock out everyone', async () => {
    const url = await start(1);
    for (const guess of ['one', 'two', 'three']) {
      await post(url, { ...bearer(guess), 'x-forwarded-for': '198.51.100.1' });
    }

    expect((await post(url, { ...bearer(TOKEN), 'x-forwarded-for': '198.51.100.1' })).status).toBe(429);
    expect((await post(url, { ...bearer(TOKEN), 'x-forwarded-for': '198.51.100.2' })).status).toBe(400);
  });
});
