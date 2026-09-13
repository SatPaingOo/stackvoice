import { createHash, randomBytes } from 'node:crypto';

import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import { LocalOAuthProvider } from '../../../src/infrastructure/auth/local-oauth-provider.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const REDIRECT = 'http://127.0.0.1:9999/callback';
const OWNER_TOKEN = 'owner-secret';

/** Just enough of an Express response to drive `authorize`. */
class FakeResponse {
  status_ = 0;
  body = '';
  redirectedTo: string | null = null;
  readonly req: { query: Record<string, string>; body: Record<string, unknown> };

  constructor(submittedToken?: string) {
    this.req = {
      query: { client_id: 'c', response_type: 'code' },
      body: submittedToken === undefined ? {} : { owner_token: submittedToken },
    };
  }

  status(code: number): this {
    this.status_ = code;
    return this;
  }

  type(): this {
    return this;
  }

  send(body: string): this {
    this.body = body;
    return this;
  }

  redirect(url: string): void {
    this.redirectedTo = url;
  }

  asExpress(): Response {
    return this as unknown as Response;
  }
}

const client: OAuthClientInformationFull = {
  client_id: 'client-1',
  client_name: 'Alexa Plus',
  redirect_uris: [REDIRECT],
};

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

const params = (over: Partial<AuthorizationParams> = {}): AuthorizationParams => ({
  codeChallenge: challenge,
  redirectUri: REDIRECT,
  state: 'xyz',
  scopes: ['stackvoice:read'],
  ...over,
});

const makeProvider = (ownerToken = OWNER_TOKEN): LocalOAuthProvider =>
  new LocalOAuthProvider({ ownerToken, logger: silentLogger });

/** Runs the consent step and returns the issued authorization code. */
const grantCode = async (provider: LocalOAuthProvider, over: Partial<AuthorizationParams> = {}): Promise<string> => {
  const res = new FakeResponse(OWNER_TOKEN);
  await provider.authorize(client, params(over), res.asExpress());
  const url = new URL(res.redirectedTo as string);
  return url.searchParams.get('code') as string;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('client registration', () => {
  it('issues an id and stores the client', () => {
    const provider = makeProvider();

    const registered = provider.clientsStore.registerClient({ redirect_uris: [REDIRECT] });

    expect(registered.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(provider.clientsStore.getClient(registered.client_id)?.redirect_uris).toEqual([REDIRECT]);
  });

  it('does not know an unregistered client', () => {
    expect(makeProvider().clientsStore.getClient('nope')).toBeUndefined();
  });
});

describe('authorize', () => {
  it('asks for the owner token instead of issuing a code', async () => {
    const res = new FakeResponse();

    await makeProvider().authorize(client, params(), res.asExpress());

    expect(res.status_).toBe(200);
    expect(res.body).toContain('Approve access to your stack');
    expect(res.redirectedTo).toBeNull();
  });

  it('names the client asking for access', async () => {
    const res = new FakeResponse();

    await makeProvider().authorize(client, params(), res.asExpress());

    expect(res.body).toContain('Alexa Plus');
  });

  it('re-prompts when the owner token is wrong, and issues nothing', async () => {
    const res = new FakeResponse('wrong');

    await makeProvider().authorize(client, params(), res.asExpress());

    expect(res.body).toContain('did not match');
    expect(res.redirectedTo).toBeNull();
  });

  it('redirects with a code and preserves state once approved', async () => {
    const res = new FakeResponse(OWNER_TOKEN);

    await makeProvider().authorize(client, params(), res.asExpress());

    const url = new URL(res.redirectedTo as string);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe('xyz');
  });

  it('auto-approves when no owner token is configured', async () => {
    const res = new FakeResponse();

    await makeProvider('').authorize(client, params(), res.asExpress());

    expect(res.redirectedTo).toContain('code=');
  });
});

describe('authorization code exchange', () => {
  it('returns the stored PKCE challenge without consuming the code', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider);

    expect(await provider.challengeForAuthorizationCode(client, code)).toBe(challenge);
    await expect(provider.exchangeAuthorizationCode(client, code)).resolves.toBeDefined();
  });

  it('issues a bearer token with a refresh token', async () => {
    const provider = makeProvider();

    const tokens = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe('stackvoice:read');
  });

  it('rejects a replayed code as invalid_grant, not a server error', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider);
    await provider.exchangeAuthorizationCode(client, code);

    await expect(provider.exchangeAuthorizationCode(client, code)).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it('rejects a code issued to a different client', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider);

    await expect(provider.exchangeAuthorizationCode({ ...client, client_id: 'other' }, code)).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
  });

  it('expires a code after five minutes', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(provider.exchangeAuthorizationCode(client, code)).rejects.toThrowError(/expired/);
  });

  it('rejects a mismatched redirect_uri', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider);

    await expect(
      provider.exchangeAuthorizationCode(client, code, verifier, 'http://evil.example/cb'),
    ).rejects.toBeInstanceOf(InvalidRequestError);
  });

  it('refuses a token for a resource the code was not issued for (RFC 8707)', async () => {
    const provider = makeProvider();
    const code = await grantCode(provider, { resource: new URL('https://mine.example/mcp') });

    await expect(
      provider.exchangeAuthorizationCode(client, code, verifier, REDIRECT, new URL('https://other.example/mcp')),
    ).rejects.toBeInstanceOf(InvalidTargetError);
  });
});

describe('access tokens', () => {
  it('verifies a freshly issued token', async () => {
    const provider = makeProvider();
    const tokens = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    const info = await provider.verifyAccessToken(tokens.access_token);

    expect(info.clientId).toBe('client-1');
    expect(info.scopes).toEqual(['stackvoice:read']);
  });

  it('rejects an unknown token', async () => {
    await expect(makeProvider().verifyAccessToken('made-up')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects an expired token and forgets it', async () => {
    const provider = makeProvider();
    const tokens = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    vi.advanceTimersByTime(3601 * 1000);

    await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrowError(/expired/);
  });

  it('stops accepting a revoked token', async () => {
    const provider = makeProvider();
    const tokens = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    await provider.revokeToken(client, { token: tokens.access_token });

    await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

describe('refresh tokens', () => {
  it('exchanges a refresh token for a new access token', async () => {
    const provider = makeProvider();
    const first = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    const second = await provider.exchangeRefreshToken(client, first.refresh_token as string);

    expect(second.access_token).not.toBe(first.access_token);
    await expect(provider.verifyAccessToken(second.access_token)).resolves.toBeDefined();
  });

  it('rotates: the old refresh token stops working', async () => {
    const provider = makeProvider();
    const first = await provider.exchangeAuthorizationCode(client, await grantCode(provider));
    const used = first.refresh_token as string;
    await provider.exchangeRefreshToken(client, used);

    await expect(provider.exchangeRefreshToken(client, used)).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it('rejects a refresh token belonging to another client', async () => {
    const provider = makeProvider();
    const first = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    await expect(
      provider.exchangeRefreshToken({ ...client, client_id: 'other' }, first.refresh_token as string),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });
});
