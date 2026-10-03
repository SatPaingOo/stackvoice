import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type RequestHandler, type Response } from 'express';

import type { Settings } from '../../domain/settings.js';
import { describeLockout, retryAfterSeconds, type AttemptLimiter } from '../../infrastructure/auth/attempt-limiter.js';
import { LocalOAuthProvider } from '../../infrastructure/auth/local-oauth-provider.js';
import { sameSecret } from '../../infrastructure/auth/secret-compare.js';
import { installConsole, type ConsoleDeps } from '../console/routes.js';
import { installSimulator, type SimulatorDeps } from '../simulator/routes.js';
import { createMcpServer, type McpServerDeps } from './server-factory.js';

const MCP_PATH = '/mcp';
const SESSION_HEADER = 'mcp-session-id';
// RFC 9728 appends the resource's own path, so a resource at /mcp publishes its
// metadata at /.well-known/oauth-protected-resource/mcp.
const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

export interface HttpServerDeps extends McpServerDeps {
  readonly settings: Settings;
  /** Absent when the simulator is disabled or unavailable in this auth mode. */
  readonly simulator: SimulatorDeps | null;
  /** Absent when the console is disabled. */
  readonly console: ConsoleDeps | null;
  /** Wrong owner tokens per address, shared with the console's sign-in. */
  readonly attempts: AttemptLimiter;
}

/**
 * Streamable HTTP face for the MCP server (spec 2025-11-25).
 *
 * One transport per session: POST initialises or continues a session, GET opens
 * the server-to-client stream, DELETE terminates it.
 *
 * Three auth modes (see `AuthSettings`). In `oauth` mode this process is also
 * its own OAuth 2.1 authorization server, which is what the Alexa+ MCP Toolkit
 * requires: PKCE (S256), metadata at `/.well-known/oauth-authorization-server`,
 * and `401` with a `WWW-Authenticate` pointing at the resource metadata.
 */
export function createHttpServer(deps: HttpServerDeps): {
  listen(): Promise<HttpServer>;
} {
  const app = express();
  // Behind a host's proxy, the client's address is in X-Forwarded-For. Believing
  // that header from anyone else would let a guesser choose a fresh address per try.
  if (deps.settings.server.trustedProxies > 0) app.set('trust proxy', deps.settings.server.trustedProxies);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  const transports = new Map<string, StreamableHTTPServerTransport>();
  const guard = installAuth(app, deps);

  app.post(MCP_PATH, guard, async (req, res) => {
    const sessionId = req.header(SESSION_HEADER);
    const existing = sessionId === undefined ? undefined : transports.get(sessionId);

    if (existing !== undefined) {
      await existing.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId !== undefined) {
      res.status(404).json({ error: 'unknown session' });
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'missing session id' });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
        deps.logger.info('session opened', { sessionId: id });
      },
      onsessionclosed: (id) => {
        transports.delete(id);
        deps.logger.info('session closed', { sessionId: id });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId !== undefined) transports.delete(transport.sessionId);
    };

    await createMcpServer(deps).connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  /** GET opens the stream, DELETE terminates the session — both need a live session. */
  const withSession = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header(SESSION_HEADER);
    const transport = sessionId === undefined ? undefined : transports.get(sessionId);
    if (transport === undefined) {
      res.status(404).json({ error: 'unknown session' });
      return;
    }
    await transport.handleRequest(req, res);
  };

  app.get(MCP_PATH, guard, withSession);
  app.delete(MCP_PATH, guard, withSession);

  if (deps.console !== null) {
    installConsole(app, deps.console);
  }

  if (deps.simulator !== null) {
    installSimulator(app, deps.simulator);
  }

  /** Liveness probe for the tunnel and the management CLI. Never requires auth. */
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: deps.version });
  });

  return {
    listen(): Promise<HttpServer> {
      const { host, port } = deps.settings.server;
      return new Promise((resolve, reject) => {
        // Express 5 calls this with the error when the port cannot be bound. Treating
        // every call as success logged "listening" and then exited quietly with code 0.
        const server = app.listen(port, host, (error?: Error) => {
          if (error === undefined) resolve(server);
          else reject(error);
        });
      });
    },
  };
}

/**
 * Installs the auth endpoints the chosen mode needs and returns the middleware
 * that protects `/mcp`.
 */
function installAuth(app: express.Express, deps: HttpServerDeps): RequestHandler {
  const { auth } = deps.settings;

  if (auth.mode === 'none') {
    deps.logger.warn('auth is disabled: bind to localhost only');
    return (_req, _res, next) => next();
  }

  if (auth.mode === 'token') {
    return sharedTokenGuard(auth.token, deps);
  }

  const provider = new LocalOAuthProvider({ ownerToken: auth.token, logger: deps.logger, attempts: deps.attempts });
  const issuer = new URL(auth.publicUrl);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: issuer,
      resourceServerUrl: new URL(`${auth.publicUrl}${MCP_PATH}`),
      resourceName: 'StackVoice',
      scopesSupported: ['stackvoice:read'],
    }),
  );

  return requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: `${auth.publicUrl}${RESOURCE_METADATA_PATH}`,
  });
}

/**
 * The shared bearer check for `token` mode, compared in constant time.
 *
 * A request with no Authorization header is a client finding out that it needs
 * one, so only a wrong token counts towards a lockout. A locked-out address is
 * refused before its token is looked at.
 */
function sharedTokenGuard(token: string, deps: Pick<HttpServerDeps, 'attempts' | 'logger'>): RequestHandler {
  const expected = `Bearer ${token}`;
  return (req, res, next) => {
    const address = req.ip ?? 'unknown';
    const waitMs = deps.attempts.retryAfterMs(address);
    if (waitMs > 0) {
      res
        .status(429)
        .set('Retry-After', retryAfterSeconds(waitMs))
        .json({ error: describeLockout(waitMs) });
      return;
    }

    const submitted = req.header('authorization');
    if (submitted !== undefined && sameSecret(expected, submitted)) {
      deps.attempts.recordSuccess(address);
      next();
      return;
    }

    if (submitted !== undefined) {
      deps.attempts.recordFailure(address);
      deps.logger.warn('mcp request refused: wrong bearer token', { address });
    }
    res.status(401).set('WWW-Authenticate', 'Bearer realm="stackvoice"').json({ error: 'unauthorized' });
  };
}
