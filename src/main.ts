import { resolve } from 'node:path';
import process, { argv, cwd, exit } from 'node:process';

import { HealthService } from './application/health.service.js';
import { StackVoiceError } from './domain/errors.js';
import { YamlSettingsStore } from './infrastructure/config/yaml-settings-store.js';
import { PinoLogger } from './infrastructure/logging/pino.logger.js';
import { SystemClock } from './infrastructure/system-clock.js';
import { createHttpServer } from './presentation/mcp/http-server.js';

export const VERSION = '0.1.0';

/**
 * Composition root. The only place that knows every concrete class: it builds
 * the adapters, injects them into the services, and hands the result to the
 * presentation layer. No class below this file instantiates its own
 * collaborators.
 */
async function main(): Promise<void> {
  const settingsPath = resolve(cwd(), argv[2] ?? 'config/settings.yml');

  const settings = await new YamlSettingsStore(settingsPath).load();
  const logger = PinoLogger.create(settings.server.logLevel);
  const health = new HealthService(VERSION, new SystemClock());

  const http = createHttpServer({ version: VERSION, health, logger, settings });
  const server = await http.listen();

  logger.info('stackvoice listening', {
    host: settings.server.host,
    port: settings.server.port,
    endpoint: '/mcp',
    authRequired: settings.management.authToken !== '',
  });

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
