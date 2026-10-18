import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import type { Settings } from '../../../src/domain/settings.js';
import { AttemptLimiter } from '../../../src/infrastructure/auth/attempt-limiter.js';
import { JsonOAuthStateFile } from '../../../src/infrastructure/auth/oauth-state-file.js';
import { createHttpServer, type HttpServerDeps } from '../../../src/presentation/mcp/http-server.js';

/**
 * `oauth` mode over HTTP, the way a client such as Claude Code goes through it:
 * register, approve, exchange the code, and then the server restarts. A request
 * that gets past the bearer check without a session answers 400, so 400 here
 * means "let in".
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const OWNER_TOKEN = 'owner-secret';
const REDIRECT = 'http://127.0.0.1:9/callback';

let server: Server | null = null;
let statePath: string;
let base: string;

beforeEach(async () => {
  statePath = join(await mkdtemp(join(tmpdir(), 'stackvoice-oauth-http-')), 'oauth.json');
});

afterEach(async () => {
  await stop();
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0));
    });
  });
}

/**
 * Starts the server on a fresh port each time, so no connection kept alive from
 * before a restart is reused. What carries over is the state file, as it would.
 */
async function start(): Promise<void> {
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  const settings: Settings = {
    server: { host: '127.0.0.1', port, logLevel: 'warn', trustedProxies: 0 },
    management: { cli: true },
    auth: { mode: 'oauth', token: OWNER_TOKEN, publicUrl: base },
    console: { enabled: false },
    simulator: { enabled: false },
    sources: { allowPrivateNetwork: false, dataDir: 'data' },
    cache: { ttlSeconds: 300 },
  };
  const deps = {
    version: 'test',
    logger: silentLogger,
    settings,
    simulator: null,
    console: null,
    attempts: new AttemptLimiter({ maxFailures: 3, windowMs: 60_000 }),
    oauthState: new JsonOAuthStateFile(statePath),
  } as unknown as HttpServerDeps;
  server = await createHttpServer(deps).listen();
}

async function stop(): Promise<void> {
  const running = server;
  server = null;
  if (running !== null) await new Promise<void>((resolve) => running.close(() => resolve()));
}

/** The provider saves in the background; a restart waits until the refresh token is on disk. */
async function savedRefreshTokens(count: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await new JsonOAuthStateFile(statePath).load()).refreshTokens.length === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`the state file never held ${String(count)} refresh token(s)`);
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
  redirect: 'manual',
});

const callMcp = (accessToken: string): Promise<globalThis.Response> =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: '{}',
  });

interface Tokens {
  readonly access_token: string;
  readonly refresh_token: string;
}

/** Dynamic client registration, consent with the owner token, and the code exchanged with PKCE. */
async function registerAndSignIn(): Promise<{ clientId: string; tokens: Tokens }> {
  const registered = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test client',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  expect(registered.status).toBe(201);
  const clientId = ((await registered.json()) as { client_id: string }).client_id;

  const verifier = randomBytes(32).toString('base64url');
  const approved = await fetch(
    `${base}/authorize`,
    form({
      client_id: clientId,
      response_type: 'code',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: REDIRECT,
      state: 'xyz',
      owner_token: OWNER_TOKEN,
    }),
  );
  expect(approved.status).toBe(302);
  const code = new URL(approved.headers.get('location') as string).searchParams.get('code') as string;

  const exchanged = await fetch(
    `${base}/token`,
    form({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  );
  expect(exchanged.status).toBe(200);
  return { clientId, tokens: (await exchanged.json()) as Tokens };
}

describe('oauth mode across a restart', () => {
  it('still knows the client, so the consent page opens instead of invalid_client', async () => {
    await start();
    const { clientId } = await registerAndSignIn();
    await savedRefreshTokens(1);
    await stop();

    await start();
    const page = await fetch(
      `${base}/authorize?${new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        code_challenge: 'x'.repeat(43),
        code_challenge_method: 'S256',
        redirect_uri: REDIRECT,
      }).toString()}`,
    );

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Approve access to your stack');
  });

  it('refuses the old access token, and lets the client back in with its refresh token', async () => {
    await start();
    const { clientId, tokens } = await registerAndSignIn();
    expect((await callMcp(tokens.access_token)).status).toBe(400);
    await savedRefreshTokens(1);
    await stop();

    await start();
    expect((await callMcp(tokens.access_token)).status).toBe(401);

    const refreshed = await fetch(
      `${base}/token`,
      form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }),
    );
    expect(refreshed.status).toBe(200);
    const renewed = (await refreshed.json()) as Tokens;
    expect((await callMcp(renewed.access_token)).status).toBe(400);
  });
});
