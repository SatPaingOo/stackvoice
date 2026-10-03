import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import { McpLoopbackClient } from '../../../src/infrastructure/mcp/mcp-loopback-client.js';

/**
 * The simulator's MCP client against a real Streamable HTTP server that keeps
 * sessions the way StackVoice's does, so a session left open shows up here.
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

let server: Server;
let endpoint: string;
const opened: string[] = [];
const closed: string[] = [];
const live = new Map<string, StreamableHTTPServerTransport>();

beforeEach(async () => {
  opened.length = 0;
  closed.length = 0;
  live.clear();

  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const id = req.header('mcp-session-id');
    const existing = id === undefined ? undefined : live.get(id);
    if (existing !== undefined) {
      await existing.handleRequest(req, res, req.body);
      return;
    }
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: 'missing session id' });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        live.set(sessionId, transport);
        opened.push(sessionId);
      },
      onsessionclosed: (sessionId) => {
        live.delete(sessionId);
        closed.push(sessionId);
      },
    });
    const mcp = new McpServer({ name: 'test', version: '1.0.0' });
    mcp.registerTool('ping', { description: 'Answers pong.' }, async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }));
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.delete('/mcp', async (req, res) => {
    const transport = live.get(req.header('mcp-session-id') ?? '');
    if (transport === undefined) {
      res.status(404).json({ error: 'unknown session' });
      return;
    }
    await transport.handleRequest(req, res);
  });

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('McpLoopbackClient', () => {
  it('calls a tool and returns what it said', async () => {
    const client = new McpLoopbackClient({ endpoint, bearerToken: null, logger: silentLogger });

    const outcome = await client.callTool('ping', {});

    expect(outcome.spoken).toBe('pong');
    expect(outcome.isError).toBe(false);
  });

  it('ends the session it opened, so questions do not pile up sessions on the server', async () => {
    const client = new McpLoopbackClient({ endpoint, bearerToken: null, logger: silentLogger });

    await client.callTool('ping', {});
    await client.callTool('ping', {});

    expect(opened).toHaveLength(2);
    expect(closed).toEqual(opened);
    expect(live.size).toBe(0);
  });
});
