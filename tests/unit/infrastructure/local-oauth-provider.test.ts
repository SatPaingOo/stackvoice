import { createHash, randomBytes } from 'node:crypto';

import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import { AttemptLimiter } from '../../../src/infrastructure/auth/attempt-limiter.js';
import { LocalOAuthProvider } from '../../../src/infrastructure/auth/local-oauth-provider.js';
import type { OAuthState, OAuthStatePort } from '../../../src/infrastructure/auth/oauth-state-file.js';

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
  readonly headers: Record<string, string> = {};
  readonly req: { query: Record<string, string>; body: Record<string, unknown>; ip: string };

  constructor(submittedToken?: string, ip = '203.0.113.7') {
    this.req = {
      query: { client_id: 'c', response_type: 'code' },
      body: submittedToken === undefined ? {} : { owner_token: submittedToken },
      ip,
    };
  }

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
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
  new LocalOAuthProvider({
    ownerToken,
    logger: silentLogger,
    attempts: new AttemptLimiter({ maxFailures: 3, windowMs: 15 * 60 * 1000 }),
  });

/** Submits the owner token on the consent page and returns the response. */
const consent = async (provider: LocalOAuthProvider, token?: string, ip?: string): Promise<FakeResponse> => {
  const res = new FakeResponse(token, ip);
  await provider.authorize(client, params(), res.asExpress());
  return res;
};

/** Runs the consent step and returns the issued authorization code. */
const grantCode = async (
  provider: LocalOAuthProvider,
  over: Partial<AuthorizationParams> = {},
  to: OAuthClientInformationFull = client,
): Promise<string> => {
  const res = new FakeResponse(OWNER_TOKEN);
  await provider.authorize(to, params(over), res.asExpress());
  const url = new URL(res.redirectedTo as string);
  return url.searchParams.get('code') as string;
};

/** Registers a client the way dynamic client registration does. */
const register = async (provider: LocalOAuthProvider, name = 'Claude Code'): Promise<OAuthClientInformationFull> => {
  const registerClient = provider.clientsStore.registerClient;
  if (registerClient === undefined) throw new Error('the provider takes no registrations');
  return registerClient({ redirect_uris: [REDIRECT], client_name: name });
};

/** Signs a registered client in: consent, then the code exchanged for tokens. */
const signIn = async (provider: LocalOAuthProvider, to: OAuthClientInformationFull): Promise<OAuthTokens> =>
  provider.exchangeAuthorizationCode(to, await grantCode(provider, {}, to));

/** What a state file would hold, kept in memory, so a test can restart the provider over it. */
class MemoryState implements OAuthStatePort {
  saved: OAuthState = { clients: [], refreshTokens: [] };

  async load(): Promise<OAuthState> {
    return structuredClone(this.saved);
  }

  async save(state: OAuthState): Promise<void> {
    this.saved = structuredClone(state);
  }
}

const withState = (state: OAuthStatePort): LocalOAuthProvider =>
  new LocalOAuthProvider({
    ownerToken: OWNER_TOKEN,
    logger: silentLogger,
    attempts: new AttemptLimiter({ maxFailures: 3, windowMs: 15 * 60 * 1000 }),
    state,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('client registration', () => {
  it('issues an id and stores the client', async () => {
    const provider = makeProvider();

    const registered = await register(provider);

    expect(registered.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await provider.clientsStore.getClient(registered.client_id))?.redirect_uris).toEqual([REDIRECT]);
  });

  it('does not know an unregistered client', async () => {
    expect(await makeProvider().clientsStore.getClient('nope')).toBeUndefined();
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

  it('keeps the authorization parameters on the page it shows again after a posted wrong token', async () => {
    const res = new FakeResponse('wrong');
    // A browser posts the form: the parameters arrive in the body, the query is empty.
    res.req.query = {};
    res.req.body = { client_id: 'c', response_type: 'code', owner_token: 'wrong' };

    await makeProvider().authorize(client, params(), res.asExpress());

    expect(res.body).toContain('<input type="hidden" name="client_id" value="c">');
    expect(res.body).toContain('<input type="hidden" name="response_type" value="code">');
    expect(res.body).not.toContain('value="wrong"');
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

describe('authorize: wrong owner tokens', () => {
  it('locks the address out after too many wrong tokens, even for the right one', async () => {
    const provider = makeProvider();
    for (const guess of ['one', 'two', 'three']) expect((await consent(provider, guess)).status_).toBe(200);

    const locked = await consent(provider, OWNER_TOKEN);

    expect(locked.status_).toBe(429);
    expect(locked.headers['retry-after']).toBe('900');
    expect(locked.body).toContain('Too many wrong tokens from this address. Try again in 15 minutes.');
    expect(locked.redirectedTo).toBeNull();
  });

  it('lets the address try again once the window has passed', async () => {
    const provider = makeProvider();
    for (const guess of ['one', 'two', 'three']) await consent(provider, guess);

    vi.advanceTimersByTime(15 * 60 * 1000);

    expect((await consent(provider, OWNER_TOKEN)).redirectedTo).toContain('code=');
  });

  it('does not lock out another address', async () => {
    const provider = makeProvider();
    for (const guess of ['one', 'two', 'three']) await consent(provider, guess);

    expect((await consent(provider, OWNER_TOKEN, '198.51.100.20')).redirectedTo).toContain('code=');
  });

  it('does not count opening the page as a guess', async () => {
    const provider = makeProvider();
    for (let i = 0; i < 5; i += 1) await consent(provider);

    expect((await consent(provider, OWNER_TOKEN)).redirectedTo).toContain('code=');
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

  it('expires a refresh token after thirty days', async () => {
    const provider = makeProvider();
    const first = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1000);

    await expect(provider.exchangeRefreshToken(client, first.refresh_token as string)).rejects.toThrowError(/expired/);
  });

  it('can narrow the scopes on a refresh, never widen them', async () => {
    const provider = makeProvider();
    const first = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    await expect(
      provider.exchangeRefreshToken(client, first.refresh_token as string, ['stackvoice:read', 'stackvoice:write']),
    ).rejects.toBeInstanceOf(InvalidScopeError);
  });

  it('keeps only the five newest refresh tokens of a client that signs in again and again', async () => {
    const provider = makeProvider();
    const signIns: OAuthTokens[] = [];
    for (let n = 0; n < 6; n++)
      signIns.push(await provider.exchangeAuthorizationCode(client, await grantCode(provider)));

    await expect(provider.exchangeRefreshToken(client, signIns[0]?.refresh_token as string)).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
    await expect(provider.exchangeRefreshToken(client, signIns[5]?.refresh_token as string)).resolves.toBeDefined();
  });

  it('revokes only a token issued to the client asking', async () => {
    const provider = makeProvider();
    const tokens = await provider.exchangeAuthorizationCode(client, await grantCode(provider));

    await provider.revokeToken({ ...client, client_id: 'other' }, { token: tokens.refresh_token as string });

    await expect(provider.exchangeRefreshToken(client, tokens.refresh_token as string)).resolves.toBeDefined();
  });
});

describe('across a restart', () => {
  it('still knows a client that registered before it', async () => {
    const state = new MemoryState();
    const before = withState(state);
    const registered = await register(before);
    await before.flush();

    const after = withState(state);

    expect((await after.clientsStore.getClient(registered.client_id))?.client_name).toBe('Claude Code');
  });

  it('signs a client back in with its refresh token; its access token is refused', async () => {
    const state = new MemoryState();
    const before = withState(state);
    const registered = await register(before);
    const tokens = await signIn(before, registered);
    await before.flush();

    const after = withState(state);

    await expect(after.verifyAccessToken(tokens.access_token)).rejects.toBeInstanceOf(InvalidTokenError);
    const renewed = await after.exchangeRefreshToken(registered, tokens.refresh_token as string);
    await expect(after.verifyAccessToken(renewed.access_token)).resolves.toMatchObject({
      clientId: registered.client_id,
    });
  });

  it('keeps refresh tokens on disk only as digests', async () => {
    const state = new MemoryState();
    const provider = withState(state);
    const tokens = await signIn(provider, await register(provider));
    await provider.flush();

    const onDisk = JSON.stringify(state.saved);
    const refresh = tokens.refresh_token as string;

    expect(onDisk).not.toContain(refresh);
    expect(onDisk).not.toContain(tokens.access_token);
    expect(onDisk).toContain(createHash('sha256').update(refresh).digest('hex'));
  });

  it('forgets the client unused for longest once a hundred have registered, with its tokens', async () => {
    const state = new MemoryState();
    const provider = withState(state);
    const first = await register(provider, 'first');
    const tokens = await signIn(provider, first);
    for (let n = 0; n < 100; n++) {
      vi.advanceTimersByTime(1000);
      await register(provider, `client ${String(n)}`);
    }
    await provider.flush();

    expect(await provider.clientsStore.getClient(first.client_id)).toBeUndefined();
    expect(state.saved.clients).toHaveLength(100);
    await expect(provider.exchangeRefreshToken(first, tokens.refresh_token as string)).rejects.toBeInstanceOf(
      InvalidGrantError,
    );
  });

  it('starts empty, and still takes registrations, when the state cannot be read', async () => {
    const broken: OAuthStatePort = {
      load: () => Promise.reject(new Error('unreadable')),
      save: () => Promise.resolve(),
    };
    const provider = withState(broken);

    expect(await provider.clientsStore.getClient('anything')).toBeUndefined();
    expect((await register(provider)).client_id).toBeTruthy();
  });
});
