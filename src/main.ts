import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process, { argv, cwd, exit } from 'node:process';

import { AppRegistryService } from './application/app-registry.service.js';
import { ConversationService } from './application/conversation.service.js';
import { ManagementService } from './application/management.service.js';
import { ShortcutRegistryService } from './application/shortcut-registry.service.js';
import { ShortcutService } from './application/shortcut.service.js';
import { HealthService } from './application/health.service.js';
import { ReadService } from './application/read.service.js';
import { SearchService } from './application/search.service.js';
import { StatusService } from './application/status.service.js';
import { ToolCatalogService } from './application/tool-catalog.service.js';
import { ToolRunner } from './application/tool-runner.service.js';
import { StackVoiceError } from './domain/errors.js';
import type { DataSourceReader } from './domain/ports/data-source-reader.js';
import { ReaderFactory } from './infrastructure/adapters/adapter-factory.js';
import { GithubRepoAdapter } from './infrastructure/adapters/github-repo.adapter.js';
import { GithubRepoInspector } from './infrastructure/adapters/github-repo.inspector.js';
import { CompositeSourceInspector } from './infrastructure/adapters/composite.inspector.js';
import { assertDataDirIsolated } from './infrastructure/adapters/data-file.js';
import { UrlSourceReader } from './infrastructure/adapters/url.adapter.js';
import { UrlSourceInspector } from './infrastructure/adapters/url.inspector.js';
import { YamlSecretStore } from './infrastructure/config/yaml-secret-store.js';
import { ConfigWatcher } from './infrastructure/config/config-watcher.js';
import { YamlConfigStore } from './infrastructure/config/yaml-config-store.js';
import { YamlSettingsStore } from './infrastructure/config/yaml-settings-store.js';
import { YamlShortcutStore } from './infrastructure/config/yaml-shortcut-store.js';
import { HttpClient } from './infrastructure/http/http-client.js';
import { TtlCache } from './infrastructure/http/ttl-cache.js';
import { PinoLogger } from './infrastructure/logging/pino.logger.js';
import { McpLoopbackClient } from './infrastructure/mcp/mcp-loopback-client.js';
import { SystemClock } from './infrastructure/system-clock.js';
import { createHttpServer } from './presentation/mcp/http-server.js';
import { ToolMapper } from './presentation/mcp/tool-mapper.js';
import type { ConsoleDeps } from './presentation/console/routes.js';
import type { SimulatorDeps } from './presentation/simulator/routes.js';

export const VERSION = '0.3.0';

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
  const shortcutsPath = resolve(appsDir, '..', 'shortcuts.yml');

  const settingsStore = new YamlSettingsStore(settingsPath);
  const settings = await settingsStore.load();
  const logger = PinoLogger.create(settings.server.logLevel);
  const clock = new SystemClock();

  // infrastructure
  const cache = new TtlCache(settings.cache.ttlSeconds * 1000);
  const http = new HttpClient({
    timeoutMs: FETCH_TIMEOUT_MS,
    cache,
    logger,
    policy: { allowPrivateNetwork: settings.sources.allowPrivateNetwork },
  });
  const dataDir = resolve(cwd(), settings.sources.dataDir);
  const secrets = new YamlSecretStore(resolve(appsDir, '..', 'secrets.yml'));
  // File sources read anything in the data directory, so it must stay clear of config/.
  assertDataDirIsolated(dataDir, resolve(appsDir, '..'));
  // So the first file dropped in has somewhere to go, and the console can say where.
  await mkdir(dataDir, { recursive: true });
  // One reader serves links and files alike: both are "get a body, parse it".
  const urlReader = new UrlSourceReader({ http, secrets, dataDir });
  const readers = new Map<string, DataSourceReader>([
    ['github-repo', new GithubRepoAdapter(http)],
    ['url', urlReader],
    ['file', urlReader],
  ]);
  const inspector = new CompositeSourceInspector(
    new GithubRepoInspector(http),
    new UrlSourceInspector({ http, secrets, dataDir }),
  );
  const readerFactory = new ReaderFactory(readers);

  // application
  const store = new YamlConfigStore(appsDir);
  const shortcutStore = new YamlShortcutStore(shortcutsPath);
  const registry = new AppRegistryService(store, logger);
  const shortcuts = new ShortcutRegistryService(shortcutStore, logger);
  await registry.load();
  await shortcuts.load();

  const search = new SearchService(registry, readerFactory);
  const read = new ReadService(registry, readerFactory);
  const status = new StatusService(registry, readerFactory);
  const health = new HealthService(VERSION, clock, registry, status);
  const catalog = new ToolCatalogService();
  const runner = new ToolRunner({ registry, search, read, status, health, now: () => clock.now() });
  const shortcutService = new ShortcutService(runner, logger, () => clock.now());

  // presentation
  const mapper = new ToolMapper({ runner, shortcuts, shortcutService, logger });

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
    simulator = {
      conversation: new ConversationService(registry, caller, shortcuts),
      registry,
      shortcuts,
      logger,
    };
  } else if (settings.simulator.enabled) {
    logger.warn('simulator disabled: it cannot complete the OAuth flow on its own');
  }

  // Saving from the console must take effect at once, so it reloads the same
  // registry the watcher does rather than waiting for the file event.
  const reload = async (): Promise<void> => {
    await registry.load();
    await shortcuts.load();
  };

  // The console's browser code is compiled separately. Without it the pages load and do nothing.
  const assetsDir = resolve(cwd(), 'dist', 'public');
  if (settings.console.enabled) {
    await access(resolve(assetsDir, 'apps', 'apps-page.js')).catch(() =>
      logger.warn('console assets missing: run npm run build:client', { assetsDir }),
    );
  }

  const console_: ConsoleDeps | null = settings.console.enabled
    ? {
        management: new ManagementService(store, inspector, logger, shortcutStore),
        catalog,
        registry,
        shortcuts,
        health,
        logger,
        // With no auth configured the server is on localhost only, so the
        // console is as reachable as the config file itself and a sign-in adds
        // nothing. The moment the server is exposed, it asks for the token.
        ownerToken: settings.auth.mode === 'none' ? '' : settings.auth.token,
        reload,
        settings,
        settingsStore,
        secrets,
        assetsDir,
      }
    : null;

  const http_ = createHttpServer({
    version: VERSION,
    registry,
    shortcuts,
    catalog,
    mapper,
    logger,
    settings,
    simulator,
    console: console_,
  });
  const server = await http_.listen();

  logger.info('stackvoice listening', {
    host: settings.server.host,
    port: settings.server.port,
    endpoint: '/mcp',
    apps: registry.listEnabled().map((app) => app.id),
    auth: settings.auth.mode,
    simulator: simulator === null ? 'off' : '/simulator',
    console: console_ === null ? 'off' : '/console',
    shortcuts: shortcuts.listEnabled().map((shortcut) => shortcut.toolName),
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

  // Adding an app should not mean restarting. Each MCP session reads the
  // registry when it connects, so reloading is enough for the next conversation
  // to see the new tools.
  const watcher = new ConfigWatcher({ appsDir, logger, reload });
  watcher.start();

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    watcher.stop();
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
