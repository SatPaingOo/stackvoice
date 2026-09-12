import { resolve } from 'node:path';
import process, { argv, cwd, exit } from 'node:process';

import { AppRegistryService } from './application/app-registry.service.js';
import { ConversationService } from './application/conversation.service.js';
import { HealthService } from './application/health.service.js';
import { ReadService } from './application/read.service.js';
import { SearchService } from './application/search.service.js';
import { StatusService } from './application/status.service.js';
import { ToolCatalogService } from './application/tool-catalog.service.js';
import { StackVoiceError } from './domain/errors.js';
import type { DataSourceReader } from './domain/ports/data-source-reader.js';
import { ReaderFactory } from './infrastructure/adapters/adapter-factory.js';
import { GithubRepoAdapter } from './infrastructure/adapters/github-repo.adapter.js';
import { YamlConfigStore } from './infrastructure/config/yaml-config-store.js';
import { YamlSettingsStore } from './infrastructure/config/yaml-settings-store.js';
import { HttpClient } from './infrastructure/http/http-client.js';
import { TtlCache } from './infrastructure/http/ttl-cache.js';
import { PinoLogger } from './infrastructure/logging/pino.logger.js';
import { McpLoopbackClient } from './infrastructure/mcp/mcp-loopback-client.js';
import { SystemClock } from './infrastructure/system-clock.js';
import { createHttpServer } from './presentation/mcp/http-server.js';
import { ToolMapper } from './presentation/mcp/tool-mapper.js';
import type { SimulatorDeps } from './presentation/simulator/routes.js';

export const VERSION = '0.2.0';

const FETCH_TIMEOUT_MS = 8000;

/**
 * Composition root. The only place that knows every concrete class: it builds
 * the adapters, injects them into the services, and hands the result to the
 * presentation layer. No class below this file instantiates its own
 * collaborators.
 */
async function main(): Promise<void> {
  const settingsPath = resolve(cwd(), argv[2] ?? 'config/settings.yml');
  const appsDir = resolve(cwd(), argv[3] ?? 'config/apps');

  const settings = await new YamlSettingsStore(settingsPath).load();
  const logger = PinoLogger.create(settings.server.logLevel);
  const clock = new SystemClock();

  // infrastructure
  const cache = new TtlCache(settings.cache.ttlSeconds * 1000);
  const http = new HttpClient({ timeoutMs: FETCH_TIMEOUT_MS, cache, logger });
  const readers = new Map<string, DataSourceReader>([['github-repo', new GithubRepoAdapter(http)]]);
  const readerFactory = new ReaderFactory(readers);

  // application
  const registry = new AppRegistryService(new YamlConfigStore(appsDir), logger);
  await registry.load();

  const search = new SearchService(registry, readerFactory);
  const read = new ReadService(registry, readerFactory);
  const status = new StatusService(registry, readerFactory);
  const health = new HealthService(VERSION, clock, registry, status);
  const catalog = new ToolCatalogService();

  // presentation
  const mapper = new ToolMapper({
    registry,
    search,
    read,
    status,
    health,
    logger,
    now: () => clock.now(),
  });

  // The simulator drives the server as an ordinary MCP client over its own
  // endpoint, which is only possible when it can authenticate. OAuth mode needs
  // a browser flow the simulator cannot complete on its own, so it stands down.
  let simulator: SimulatorDeps | null = null;
  if (settings.simulator.enabled && settings.auth.mode !== 'oauth') {
    const endpoint =
      settings.auth.publicUrl === ''
        ? `http://${settings.server.host}:${settings.server.port}${'/mcp'}`
        : `${settings.auth.publicUrl}/mcp`;
    const caller = new McpLoopbackClient({
      endpoint,
      bearerToken: settings.auth.mode === 'token' ? settings.auth.token : null,
      logger,
    });
    simulator = { conversation: new ConversationService(registry, caller), registry, logger };
  } else if (settings.simulator.enabled) {
    logger.warn('simulator disabled: it cannot complete the OAuth flow on its own');
  }

  const http_ = createHttpServer({ version: VERSION, registry, catalog, mapper, logger, settings, simulator });
  const server = await http_.listen();

  logger.info('stackvoice listening', {
    host: settings.server.host,
    port: settings.server.port,
    endpoint: '/mcp',
    apps: registry.listEnabled().map((app) => app.id),
    auth: settings.auth.mode,
    simulator: simulator === null ? 'off' : '/simulator',
  });

  // Warm the cache so the first tool call does not pay for a cold fetch: the
  // Alexa+ round-trip budget is 500 ms and a cold GitHub fetch alone exceeds it.
  // Status and search read different documents, so warm both.
  void Promise.all(
    registry.listEnabled().flatMap((app) => [
      status.report(app),
      app.primitives.search ? search.search(app.id, { limit: 1 }) : Promise.resolve([]),
    ]),
  )
    .then(() => logger.info('cache warmed', { entries: cache.size }))
    .catch((error: unknown) => logger.warn('cache warm failed', { reason: String(error) }));

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    server.close(() => exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof StackVoiceError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(error);
  }
  exit(1);
});
