import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type Response } from 'express';

import type { Settings } from '../../domain/settings.js';
import { createMcpServer, type McpServerDeps } from './server-factory.js';

const MCP_PATH = '/mcp';
const SESSION_HEADER = 'mcp-session-id';

export interface HttpServerDeps extends McpServerDeps {
  readonly settings: Settings;
}

/**
 * Streamable HTTP face for the MCP server (spec 2025-11-25).
 *
 * One transport per session: POST initialises or continues a session, GET opens
 * the server-to-client stream, DELETE terminates it.
 *
 * Auth is a shared bearer token for now. Stage 2 replaces this guard with a
 * full OAuth 2.1 resource server (PKCE S256, protected-resource metadata) as
 * the Alexa+ MCP Toolkit requires; the 401 contract below already matches.
 */
export function createHttpServer(deps: HttpServerDeps): {
  listen(): Promise<HttpServer>;
} {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const transports = new Map<string, StreamableHTTPServerTransport>();
  const { authToken } = deps.settings.management;

  /** Returns true when the request may proceed; writes 401 and returns false otherwise. */
  const authorized = (req: Request, res: Response): boolean => {
    if (authToken === '') return true;
    const header = req.header('authorization') ?? '';
    if (header === `Bearer ${authToken}`) return true;
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="stackvoice"')
      .json({ error: 'unauthorized' });
    return false;
  };

  app.post(MCP_PATH, async (req, res) => {
    if (!authorized(req, res)) return;

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
    if (!authorized(req, res)) return;
    const sessionId = req.header(SESSION_HEADER);
    const transport = sessionId === undefined ? undefined : transports.get(sessionId);
    if (transport === undefined) {
      res.status(404).json({ error: 'unknown session' });
      return;
    }
    await transport.handleRequest(req, res);
  };

  app.get(MCP_PATH, withSession);
  app.delete(MCP_PATH, withSession);

  /** Liveness probe for the tunnel and the management CLI. Never requires auth. */
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: deps.version });
  });

  return {
    listen(): Promise<HttpServer> {
      const { host, port } = deps.settings.server;
      return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => resolve(server));
        server.once('error', reject);
      });
    },
  };
}
