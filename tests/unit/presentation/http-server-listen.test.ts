import type { Server } from 'node:http';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import type { Settings } from '../../../src/domain/settings.js';
import { createHttpServer, type HttpServerDeps } from '../../../src/presentation/mcp/http-server.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const settingsOn = (port: number): Settings => ({
  server: { host: '127.0.0.1', port, logLevel: 'warn', trustedProxies: 0 },
  management: { cli: true },
  auth: { mode: 'none', token: '', publicUrl: '' },
  console: { enabled: false },
  simulator: { enabled: false },
  sources: { allowPrivateNetwork: false, dataDir: 'data' },
  cache: { ttlSeconds: 300 },
});

// Listening touches only the settings and the logger; the rest is used per request.
const depsOn = (port: number): HttpServerDeps =>
  ({
    version: 'test',
    logger: silentLogger,
    settings: settingsOn(port),
    simulator: null,
    console: null,
  }) as unknown as HttpServerDeps;

const toClose: { close(callback: () => void): unknown }[] = [];

afterEach(async () => {
  await Promise.all(toClose.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('createHttpServer().listen', () => {
  it('resolves with a server that is listening', async () => {
    const server: Server = await createHttpServer(depsOn(0)).listen();
    toClose.push(server);

    expect((server.address() as AddressInfo).port).toBeGreaterThan(0);
  });

  it('rejects when the port is taken, instead of reporting that it listens', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
    toClose.push(blocker);
    const { port } = blocker.address() as AddressInfo;

    await expect(createHttpServer(depsOn(port)).listen()).rejects.toThrowError(/EADDRINUSE/);
  });
});
