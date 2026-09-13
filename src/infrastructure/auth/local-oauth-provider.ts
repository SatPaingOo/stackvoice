import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidRequestError,
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
import { renderConsentPage } from './consent-page.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

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
}

/** In-memory client registry. Self-hosted, single owner: a database would be ceremony. */
class MemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(registered.client_id, registered);
    return registered;
  }
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
 * Nothing is persisted: a restart invalidates every token, which for a
 * single-owner server is a feature rather than a limitation.
 */
export class LocalOAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new MemoryClientsStore();

  private readonly codes = new Map<string, PendingCode>();
  private readonly accessTokens = new Map<string, IssuedToken>();
  private readonly refreshTokens = new Map<string, IssuedToken>();

  constructor(private readonly options: LocalOAuthProviderOptions) {
    if (options.ownerToken === '') {
      options.logger.warn('oauth consent is open: set auth.token in settings to require approval');
    }
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!this.ownerApproved(res)) {
      res
        .status(200)
        .type('html')
        .send(renderConsentPage(client, res.req.query, this.hasRetried(res)));
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
    const existing = this.refreshTokens.get(refreshToken);
    if (existing === undefined || existing.clientId !== client.client_id) {
      throw new InvalidGrantError('refresh token is not valid for this client');
    }
    this.refreshTokens.delete(refreshToken);
    return this.issue(existing.clientId, scopes ?? existing.scopes, resource?.toString() ?? existing.resource);
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

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.accessTokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  private issue(clientId: string, scopes: string[], resource: string | undefined): OAuthTokens {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

    this.accessTokens.set(accessToken, { clientId, scopes, resource, expiresAt });
    this.refreshTokens.set(refreshToken, { clientId, scopes, resource, expiresAt });

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

  /** Compares the submitted owner token in constant time. */
  private ownerApproved(res: Response): boolean {
    if (this.options.ownerToken === '') return true;

    const body = res.req.body as Record<string, unknown> | undefined;
    const submitted = typeof body?.['owner_token'] === 'string' ? (body['owner_token'] as string) : '';
    if (submitted === '') return false;

    const expected = Buffer.from(this.options.ownerToken);
    const actual = Buffer.from(submitted);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /** True when the owner already submitted a token and it was wrong. */
  private hasRetried(res: Response): boolean {
    const body = res.req.body as Record<string, unknown> | undefined;
    return typeof body?.['owner_token'] === 'string' && body['owner_token'] !== '';
  }
}
