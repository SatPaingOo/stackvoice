import { resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

import { AppRegistryService } from './application/app-registry.service.js';
import { HealthService } from './application/health.service.js';
import { ManagementService } from './application/management.service.js';
import { StatusService } from './application/status.service.js';
import { StackVoiceError, ValidationError } from './domain/errors.js';
import type { DataSourceReader } from './domain/ports/data-source-reader.js';
import { ReaderFactory } from './infrastructure/adapters/adapter-factory.js';
import { GithubRepoAdapter } from './infrastructure/adapters/github-repo.adapter.js';
import { GithubRepoInspector } from './infrastructure/adapters/github-repo.inspector.js';
import { CompositeSourceInspector } from './infrastructure/adapters/composite.inspector.js';
import { assertDataDirIsolated } from './infrastructure/adapters/data-file.js';
import { UrlSourceReader } from './infrastructure/adapters/url.adapter.js';
import { UrlSourceInspector } from './infrastructure/adapters/url.inspector.js';
import { YamlSecretStore } from './infrastructure/config/yaml-secret-store.js';
import { YamlConfigStore } from './infrastructure/config/yaml-config-store.js';
import { YamlSettingsStore } from './infrastructure/config/yaml-settings-store.js';
import { YamlShortcutStore } from './infrastructure/config/yaml-shortcut-store.js';
import { HttpClient } from './infrastructure/http/http-client.js';
import { TtlCache } from './infrastructure/http/ttl-cache.js';
import { PinoLogger } from './infrastructure/logging/pino.logger.js';
import { SystemClock } from './infrastructure/system-clock.js';
import {
  parseArgs,
  printUsage,
  runAdd,
  runApps,
  runRemove,
  runSetEnabled,
  runShortcuts,
  runShow,
  runStatus,
  runValidate,
  type CommandDeps,
} from './presentation/cli/commands.js';
import { cross, print, printError, red } from './presentation/cli/output.js';

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Composition root for the CLI.
 *
 * A second entry point beside `main.ts`, wiring the same application services
 * to a different face. Nothing is shared but the services themselves, which is
 * the point: the CLI cannot drift from what the server does because there is
 * only one implementation of each operation.
 */
async function main(): Promise<number> {
  const { positional, flags } = parseArgs(argv.slice(2));
  const [group, action, target] = positional;

  if (group === undefined || group === 'help' || flags['help'] === true) {
    printUsage();
    return 0;
  }

  const settingsPath = resolve(cwd(), asString(flags['config']) ?? 'config/settings.yml');
  const appsDir = resolve(cwd(), asString(flags['apps']) ?? 'config/apps');
  const shortcutsPath = resolve(appsDir, '..', 'shortcuts.yml');

  const settings = await new YamlSettingsStore(settingsPath).load();
  // The CLI prints its own output; the logger would only interleave noise.
  const logger = PinoLogger.create('warn');

  const cache = new TtlCache(settings.cache.ttlSeconds * 1000);
  const http = new HttpClient({
    timeoutMs: FETCH_TIMEOUT_MS,
    cache,
    logger,
    policy: { allowPrivateNetwork: settings.sources.allowPrivateNetwork },
  });
  const store = new YamlConfigStore(appsDir);
  const dataDir = resolve(cwd(), settings.sources.dataDir);
  const secrets = new YamlSecretStore(resolve(appsDir, '..', 'secrets.yml'));
  // File sources read anything in the data directory, so it must stay clear of config/.
  assertDataDirIsolated(dataDir, resolve(appsDir, '..'));
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

  const registry = new AppRegistryService(store, logger);
  const management = new ManagementService(
    store,
    inspector,
    logger,
    new YamlShortcutStore(shortcutsPath),
  );

  const deps: CommandDeps = {
    management,
    health: new HealthService(
      '0.3.0',
      new SystemClock(),
      registry,
      new StatusService(registry, readerFactory),
    ),
  };

  switch (group) {
    case 'apps':
      return runApps(deps);

    case 'status':
      await registry.load();
      return runStatus(deps);

    case 'shortcuts':
      return runShortcuts(deps);

    case 'app':
      return runAppCommand(deps, action, target, flags);

    default:
      printError(`  ${cross()} unknown command "${group}"`);
      print();
      printUsage();
      return 1;
  }
}

async function runAppCommand(
  deps: CommandDeps,
  action: string | undefined,
  target: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): Promise<number> {
  if (action === undefined) {
    printUsage();
    return 1;
  }

  // `validate` is the only app command that can run without naming an app.
  if (target === undefined && action !== 'validate') {
    printError(`  ${cross()} "stackvoice app ${action}" needs an app id`);
    return 1;
  }

  switch (action) {
    case 'show':
      return runShow(deps, target as string);

    case 'validate':
      return runValidate(deps, target);

    case 'add': {
      // --from takes anything; --url, --repo and --file read more clearly in a script.
      const input =
        asString(flags['from']) ?? asString(flags['url']) ?? asString(flags['repo']) ?? asString(flags['file']);
      if (input === undefined) {
        printError(`  ${cross()} "stackvoice app add" needs ${red('--from <link | owner/repo | file>')}`);
        return 1;
      }
      const header = asString(flags['header']);
      return runAdd(deps, target as string, {
        input,
        branch: asString(flags['branch']),
        label: asString(flags['label']),
        description: asString(flags['description']),
        headers: header === undefined ? undefined : parseHeaderFlag(header),
      });
    }

    case 'enable':
      return runSetEnabled(deps, target as string, true);

    case 'disable':
      return runSetEnabled(deps, target as string, false);

    case 'remove':
      return runRemove(deps, target as string, flags['yes'] === true);

    default:
      printError(`  ${cross()} unknown command "app ${action}"`);
      return 1;
  }
}

/** `--header "Authorization: Bearer {{secret:MY_KEY}}"` as one header. */
function parseHeaderFlag(value: string): Record<string, string> {
  const at = value.indexOf(':');
  if (at <= 0) throw new ValidationError('--header must look like "Name: value"', 'header');
  return { [value.slice(0, at).trim()]: value.slice(at + 1).trim() };
}

/** A flag given without a value is `true`, which is never a usable string. */
function asString(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

main()
  .then((code) => exit(code))
  .catch((error: unknown) => {
    if (error instanceof ValidationError || error instanceof StackVoiceError) {
      printError(`  ${cross()} ${red(error.message)}`);
    } else {
      printError(`  ${cross()} ${red(String(error))}`);
    }
    exit(1);
  });
