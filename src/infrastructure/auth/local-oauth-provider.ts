import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';

import type { Logger } from '../../domain/ports/logger.js';
import { describeLockout, retryAfterSeconds, type AttemptLimiter } from './attempt-limiter.js';
import { renderConsentPage } from './consent-page.js';
import type { OAuthState, OAuthStatePort } from './oauth-state-file.js';
import { sameSecret } from './secret-compare.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Anyone who can reach the server can register a client, so the list has a ceiling. */
const MAX_CLIENTS = 100;
/** Every sign-in issues one; a client that signs in again and again keeps only its newest. */
const MAX_REFRESH_TOKENS_PER_CLIENT = 5;
const WRONG_TOKEN = 'That token did not match. Check auth.token in config/settings.yml.';

interface PendingCode {
  readonly clientId: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly scopes: string[];
  readonly resource: string | undefined;
  readonly expiresAt: number;
}

interface IssuedToken {
  readonly clientId: string;
  readonly scopes: string[];
  readonly resource: string | undefined;
  readonly expiresAt: number;
}

export interface LocalOAuthProviderOptions {
  /** The secret the owner types on the consent screen. Empty means auto-approve. */
  readonly ownerToken: string;
  readonly logger: Logger;
  /** Wrong owner tokens per address, shared with the other doors that take the token. */
  readonly attempts: AttemptLimiter;
  /** Where clients and refresh tokens outlive a restart. Absent, they live in memory only. */
  readonly state?: OAuthStatePort;
}

interface ClientRecord {
  readonly client: OAuthClientInformationFull;
  /** Seconds since the epoch: registration, then every token issued to it. */
  lastUsedAt: number;
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Refresh tokens are looked up, and stored, by digest. */
const digest = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Why the consent page is shown instead of a redirect with a code. */
interface Refusal {
  readonly status: 200 | 429;
  /** What the page says above the form; null on the first visit. */
  readonly problem: string | null;
  readonly retryAfterMs: number;
}

/**
 * The authorization parameters as the request carried them: in the query when
 * the page is first opened, in the body once the consent form is posted. Read
 * from the query alone, a page shown again after a wrong token would post
 * nothing back but the token.
 */
function carriedParameters(res: Response): Record<string, unknown> {
  return {
    ...((res.req.query ?? {}) as Record<string, unknown>),
    ...((res.req.body ?? {}) as Record<string, unknown>),
  };
}

/**
 * StackVoice as its own OAuth 2.1 authorization server.
 *
 * The Alexa+ MCP Toolkit requires OAuth 2.1 with PKCE (S256) rather than a
 * shared token, and a self-hosted server has no identity provider to delegate
 * to — so it issues its own tokens. PKCE verification itself is done by the
 * SDK's token handler against the challenge returned here.
 *
 * There is exactly one user: the person who runs the server. Instead of a login
 * screen, the consent step asks for the owner token from `config/settings.yml`.
 *
 * Registered clients and refresh tokens outlive a restart (`options.state`), so
 * a client that keeps its registration, as Claude Code does, is still known and
 * still signed in. Access tokens and authorization codes stay in memory: after a
 * restart a client's access token is refused, and its refresh token gets it a
 * new one. Refresh tokens last 30 days and rotate on every use.
 */
export class LocalOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: (clientId) => this.getClient(clientId),
    registerClient: (client) => this.registerClient(client),
  };

  private readonly clients = new Map<string, ClientRecord>();
  private readonly codes = new Map<string, PendingCode>();
  private readonly accessTokens = new Map<string, IssuedToken>();
  /** Keyed by the token's SHA-256, as on disk; oldest first. */
  private readonly refreshTokens = new Map<string, IssuedToken>();
  private readonly ready: Promise<void>;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly options: LocalOAuthProviderOptions) {
    if (options.ownerToken === '') {
      options.logger.warn('oauth consent is open: set auth.token in settings to require approval');
    }
    this.ready = this.restore();
  }

  /** Resolves once every change so far is on disk. */
  flush(): Promise<void> {
    return this.saving;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const refusal = this.refuseConsent(res);
    if (refusal !== null) {
      if (refusal.retryAfterMs > 0) res.set('Retry-After', retryAfterSeconds(refusal.retryAfterMs));
      res
        .status(refusal.status)
        .type('html')
        .send(renderConsentPage(client, carriedParameters(res), refusal.problem));
      return;
    }

    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      resource: params.resource?.toString(),
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    this.options.logger.info('authorization granted', { clientId: client.client_id });

    const target = new URL(params.redirectUri);
    target.searchParams.set('code', code);
    if (params.state !== undefined) target.searchParams.set('state', params.state);
    res.redirect(target.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const pending = this.takeValidCode(authorizationCode, client.client_id, false);
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const pending = this.takeValidCode(authorizationCode, client.client_id, true);

    if (redirectUri !== undefined && redirectUri !== pending.redirectUri) {
      throw new InvalidRequestError('redirect_uri does not match the authorization request');
    }
    // RFC 8707: a token must not be usable against a resource it was not requested for.
    if (pending.resource !== undefined && resource !== undefined && resource.toString() !== pending.resource) {
      throw new InvalidTargetError('resource does not match the authorization request');
    }

    return this.issue(pending.clientId, pending.scopes, pending.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    await this.ready;
    const key = digest(refreshToken);
    const existing = this.refreshTokens.get(key);
    if (existing === undefined || existing.clientId !== client.client_id) {
      throw new InvalidGrantError('refresh token is not valid for this client');
    }
    if (existing.expiresAt <= nowSeconds()) {
      this.refreshTokens.delete(key);
      this.persist();
      throw new InvalidGrantError('refresh token has expired');
    }
    // A refresh can narrow what was granted, never widen it (RFC 6749 §6, RFC 8707).
    if (scopes !== undefined && scopes.some((scope) => !existing.scopes.includes(scope))) {
      throw new InvalidScopeError('a refresh cannot ask for more than was granted');
    }
    if (existing.resource !== undefined && resource !== undefined && resource.toString() !== existing.resource) {
      throw new InvalidTargetError('resource does not match the one the token was issued for');
    }

    this.refreshTokens.delete(key);
    return this.issue(existing.clientId, scopes ?? existing.scopes, existing.resource ?? resource?.toString());
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const issued = this.accessTokens.get(token);
    if (issued === undefined) throw new InvalidTokenError('access token is not recognised');
    if (issued.expiresAt <= Math.floor(Date.now() / 1000)) {
      this.accessTokens.delete(token);
      throw new InvalidTokenError('access token has expired');
    }

    const info: AuthInfo = {
      token,
      clientId: issued.clientId,
      scopes: issued.scopes,
      expiresAt: issued.expiresAt,
    };
    return issued.resource === undefined ? info : { ...info, resource: new URL(issued.resource) };
  }

  /** Only a token issued to the client asking (RFC 7009); anything else is quietly left alone. */
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await this.ready;
    if (this.accessTokens.get(request.token)?.clientId === client.client_id) {
      this.accessTokens.delete(request.token);
    }
    const key = digest(request.token);
    if (this.refreshTokens.get(key)?.clientId === client.client_id) {
      this.refreshTokens.delete(key);
      this.persist();
    }
  }

  private async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    await this.ready;
    return this.clients.get(clientId)?.client;
  }

  private async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    await this.ready;
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: nowSeconds(),
    };
    this.clients.set(registered.client_id, { client: registered, lastUsedAt: nowSeconds() });

    // Over the ceiling, the client unused for longest goes, with its tokens.
    while (this.clients.size > MAX_CLIENTS) {
      let oldest: ClientRecord | undefined;
      for (const record of this.clients.values()) {
        if (oldest === undefined || record.lastUsedAt < oldest.lastUsedAt) oldest = record;
      }
      if (oldest === undefined) break;
      this.forgetClient(oldest.client.client_id);
    }

    this.persist();
    return registered;
  }

  private forgetClient(clientId: string): void {
    this.clients.delete(clientId);
    for (const [key, token] of this.refreshTokens) if (token.clientId === clientId) this.refreshTokens.delete(key);
    for (const [key, token] of this.accessTokens) if (token.clientId === clientId) this.accessTokens.delete(key);
    for (const [key, code] of this.codes) if (code.clientId === clientId) this.codes.delete(key);
    this.options.logger.info('oauth client forgotten to make room', { clientId });
  }

  private issue(clientId: string, scopes: string[], resource: string | undefined): OAuthTokens {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const now = nowSeconds();

    this.dropExpired(now);
    this.accessTokens.set(accessToken, { clientId, scopes, resource, expiresAt: now + ACCESS_TOKEN_TTL_SECONDS });
    this.refreshTokens.set(digest(refreshToken), {
      clientId,
      scopes,
      resource,
      expiresAt: now + REFRESH_TOKEN_TTL_SECONDS,
    });

    const held = [...this.refreshTokens].filter(([, token]) => token.clientId === clientId);
    for (const [key] of held.slice(0, Math.max(0, held.length - MAX_REFRESH_TOKENS_PER_CLIENT))) {
      this.refreshTokens.delete(key);
    }
    const record = this.clients.get(clientId);
    if (record !== undefined) record.lastUsedAt = now;
    this.persist();

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      ...(scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
    };
  }

  /**
   * Authorization codes are single use. The SDK asks for the challenge first and
   * exchanges second, so only the exchange consumes the code.
   */
  private takeValidCode(code: string, clientId: string, consume: boolean): PendingCode {
    const pending = this.codes.get(code);
    if (pending === undefined || pending.clientId !== clientId) {
      throw new InvalidGrantError('authorization code is not valid, already used, or issued to another client');
    }
    if (pending.expiresAt <= Date.now()) {
      this.codes.delete(code);
      throw new InvalidGrantError('authorization code has expired');
    }
    if (consume) this.codes.delete(code);
    return pending;
  }

  /** Expired tokens and codes go, so the maps do not grow for as long as the server runs. */
  private dropExpired(now: number): void {
    for (const [key, token] of this.accessTokens) if (token.expiresAt <= now) this.accessTokens.delete(key);
    for (const [key, token] of this.refreshTokens) if (token.expiresAt <= now) this.refreshTokens.delete(key);
    for (const [key, code] of this.codes) if (code.expiresAt <= now * 1000) this.codes.delete(key);
  }

  /** Clients and live refresh tokens from the last run. A file that cannot be read starts empty. */
  private async restore(): Promise<void> {
    const store = this.options.state;
    if (store === undefined) return;

    let state: OAuthState;
    try {
      state = await store.load();
    } catch (error) {
      this.options.logger.warn('oauth state could not be read; clients will register again', {
        error: String(error),
      });
      return;
    }

    const now = nowSeconds();
    for (const { client, lastUsedAt } of state.clients) this.clients.set(client.client_id, { client, lastUsedAt });
    for (const { hash, clientId, scopes, resource, expiresAt } of state.refreshTokens) {
      if (expiresAt > now && this.clients.has(clientId)) {
        this.refreshTokens.set(hash, { clientId, scopes, resource, expiresAt });
      }
    }
    if (this.clients.size > 0) {
      this.options.logger.info('oauth clients restored', {
        clients: this.clients.size,
        refreshTokens: this.refreshTokens.size,
      });
    }
  }

  /**
   * Saves in the background, one write after another, each with the state as it
   * was when asked. A failed write is logged rather than thrown: a sign-in that
   * worked should not fail because the disk is full.
   */
  private persist(): void {
    const store = this.options.state;
    if (store === undefined) return;

    const now = nowSeconds();
    const snapshot: OAuthState = {
      clients: [...this.clients.values()].map(({ client, lastUsedAt }) => ({ client, lastUsedAt })),
      refreshTokens: [...this.refreshTokens]
        .filter(([, token]) => token.expiresAt > now)
        .map(([hash, token]) => ({ hash, ...token })),
    };
    this.saving = this.saving
      .then(() => store.save(snapshot))
      .catch((error: unknown) => {
        this.options.logger.error('oauth state could not be saved', { error: String(error) });
      });
  }

  /**
   * Null when the owner approved. A locked-out address is refused before its
   * token is looked at, and only a token actually submitted counts as a guess.
   */
  private refuseConsent(res: Response): Refusal | null {
    if (this.options.ownerToken === '') return null;

    const address = res.req.ip ?? 'unknown';
    const waitMs = this.options.attempts.retryAfterMs(address);
    if (waitMs > 0) return { status: 429, problem: describeLockout(waitMs), retryAfterMs: waitMs };

    const body = res.req.body as Record<string, unknown> | undefined;
    const submitted = typeof body?.['owner_token'] === 'string' ? (body['owner_token'] as string) : '';
    if (submitted === '') return { status: 200, problem: null, retryAfterMs: 0 };

    if (!sameSecret(this.options.ownerToken, submitted)) {
      this.options.attempts.recordFailure(address);
      this.options.logger.warn('oauth consent refused: wrong owner token', { address });
      return { status: 200, problem: WRONG_TOKEN, retryAfterMs: 0 };
    }

    this.options.attempts.recordSuccess(address);
    return null;
  }
}
