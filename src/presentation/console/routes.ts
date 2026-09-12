import { randomBytes, timingSafeEqual } from 'node:crypto';

import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { HealthService } from '../../application/health.service.js';
import type { AppSpec, ManagementService } from '../../application/management.service.js';
import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import type { ShortcutService } from '../../application/shortcut.service.js';
import type { ToolCatalogService } from '../../application/tool-catalog.service.js';
import type { AppDefinition } from '../../domain/app-definition.js';
import { DEFAULT_STATUS_FIELD_MAP, type DataFormat, type SourceLocation } from '../../domain/data-source.js';
import { StackVoiceError, ValidationError } from '../../domain/errors.js';
import { parseBlocks } from '../../domain/flow.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretStore } from '../../domain/ports/secret-store.js';
import type { SettingsStore } from '../../domain/ports/settings-store.js';
import type { AuthMode, LogLevel, Settings } from '../../domain/settings.js';
import { Shortcut, type ShortcutProps } from '../../domain/shortcut.js';
import type { SourceProposal } from '../../domain/source-proposal.js';
import { renderLandingPage } from '../web/landing.js';
import { ASSETS_PATH } from '../web/layout.js';
import { renderAppsPage } from './apps-page.js';
import { renderSettingsPage } from './settings-page.js';
import { renderShortcutsPage } from './shortcuts-page.js';
import { renderSigninPage } from './signin-page.js';

export interface ConsoleDeps {
  readonly management: ManagementService;
  readonly health: HealthService;
  readonly catalog: ToolCatalogService;
  readonly registry: AppRegistryService;
  readonly shortcuts: ShortcutRegistryService;
  /** Runs a draft shortcut for the console's Try it, without saving it. */
  readonly shortcutRunner: ShortcutService;
  readonly logger: Logger;
  /** Empty means no sign-in: only ever the case when the server is bound to localhost. */
  readonly ownerToken: string;
  /** Reloads the registries so a save takes effect without a restart. */
  readonly reload: () => Promise<void>;
  /** The settings the process started with, and where to write changes. */
  readonly settings: Settings;
  readonly settingsStore: SettingsStore;
  /** API keys for url sources. The console stores and lists them; it never reads a value back. */
  readonly secrets: SecretStore;
  /** The compiled browser modules (dist/public), served at /assets. */
  readonly assetsDir: string;
}

const SESSION_COOKIE = 'stackvoice_console';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The web face: the landing page, the console routes, and their JSON API.
 *
 * A thin adapter over `ManagementService` — the same validation, the same
 * backups, the same write path as the CLI, because there is only one
 * implementation of each operation.
 */
export function installConsole(app: Express, deps: ConsoleDeps): void {
  const sessions = new Map<string, number>();
  const requiresLogin = deps.ownerToken !== '';
  // What the page shows: the last saved settings, even where they wait for a restart.
  let current: Settings = deps.settings;

  const authorized = (req: Request): boolean => {
    if (!requiresLogin) return true;
    const token = readCookie(req, SESSION_COOKIE);
    if (token === null) return false;
    const expiresAt = sessions.get(token);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  };

  const guardApi: RequestHandler = (req, res, next: NextFunction) => {
    if (authorized(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'sign in first' });
  };

  /** Pages redirect to sign-in rather than returning a bare 401. */
  const guardPage: RequestHandler = (req, res, next: NextFunction) => {
    if (authorized(req)) {
      next();
      return;
    }
    res.redirect(`/console/signin?next=${encodeURIComponent(req.path)}`);
  };

  const html =
    (render: () => string): RequestHandler =>
    (_req, res) => {
      res.type('html').send(render());
    };

  // ---- pages -------------------------------------------------------------

  // The console's component modules. Public: they carry code, never data or keys.
  app.use(ASSETS_PATH, express.static(deps.assetsDir, { index: false, dotfiles: 'ignore', fallthrough: false }));

  app.get('/', async (_req, res) => {
    const health = await deps.health.reportStack().catch(() => null);
    const items =
      health === null
        ? 0
        : health.apps
            .flatMap((entry) => entry.sources.map((source) => source.itemCount ?? 0))
            .reduce((total, count) => total + count, 0);

    res.type('html').send(
      renderLandingPage({
        appCount: deps.registry.listEnabled().length,
        toolCount: deps.catalog.generate(deps.registry.list(), deps.shortcuts.list()).length,
        itemCount: items === 0 ? null : items,
        shortcutNames: deps.shortcuts.listEnabled().map((shortcut) => shortcut.name),
      }),
    );
  });

  app.get('/console/signin', (req, res) => {
    if (!requiresLogin || authorized(req)) {
      res.redirect('/console');
      return;
    }
    res.type('html').send(renderSigninPage());
  });

  app.get('/console', guardPage, html(renderAppsPage));
  app.get('/console/apps', (_req, res) => res.redirect('/console'));
  app.get('/console/shortcuts', guardPage, html(renderShortcutsPage));
  app.get('/console/settings', guardPage, html(renderSettingsPage));

  // ---- session -----------------------------------------------------------

  app.post('/console/api/login', (req, res) => {
    const body = req.body as { token?: unknown };
    const submitted = typeof body.token === 'string' ? body.token : '';

    if (requiresLogin && !matches(deps.ownerToken, submitted)) {
      res.status(401).json({ error: 'That token did not match auth.token in config/settings.yml.' });
      return;
    }

    const token = randomBytes(24).toString('base64url');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    res
      .cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', maxAge: SESSION_TTL_MS })
      .json({ ok: true });
  });

  app.post('/console/api/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token !== null) sessions.delete(token);
    res.clearCookie(SESSION_COOKIE).json({ ok: true });
  });

  // ---- apps --------------------------------------------------------------

  app.get('/console/api/apps', guardApi, async (_req, res) => {
    await handle(res, deps, async () => {
      const [apps, health, secrets] = await Promise.all([
        deps.management.list(),
        deps.health.reportStack(),
        deps.secrets.names(),
      ]);
      const healthById = new Map(health.apps.map((entry) => [entry.appId, entry]));
      return {
        apps: apps.map((entry) => ({ ...toWire(entry, secrets), health: healthById.get(entry.id) ?? null })),
      };
    });
  });

  /** Whatever was pasted into the one box: a link, a repository or a file. Nothing is written. */
  app.post('/console/api/inspect', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const body = (req.body ?? {}) as { input?: unknown; branch?: unknown; headers?: unknown };
      const input = typeof body.input === 'string' ? body.input : '';
      const branch = typeof body.branch === 'string' && body.branch.trim() !== '' ? body.branch.trim() : undefined;
      const proposal = await deps.management.inspect(input, { branch, headers: readHeaders(body.headers) });
      return { proposal: toProposalWire(proposal) };
    });
  });

  app.put('/console/api/apps/:id', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const id = req.params['id'] as string;
      // Header values never reach the page, so a save that sends none keeps the ones saved.
      const previous = await deps.management.show(id).catch(() => null);
      const result = await deps.management.upsert(readSpec(id, req.body, previous));
      await deps.reload();
      return { app: toWire(result.app, await deps.secrets.names()), replaced: result.replaced };
    });
  });

  app.post('/console/api/apps/:id/enabled', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const enabled = (req.body as { enabled?: unknown }).enabled === true;
      const updated = await deps.management.setEnabled(req.params['id'] as string, enabled);
      await deps.reload();
      return { app: toWire(updated, await deps.secrets.names()) };
    });
  });

  app.delete('/console/api/apps/:id', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const backup = await deps.management.remove(req.params['id'] as string);
      await deps.reload();
      return { backup };
    });
  });

  // ---- shortcuts ---------------------------------------------------------

  /** Every tool a shortcut could call, so the page offers a list rather than a text box. */
  app.get('/console/api/tools', guardApi, (_req, res) => {
    const specs = deps.catalog.generate(deps.registry.list(), []);
    res.json({
      tools: specs.map((spec) => ({
        name: spec.name,
        title: spec.title,
        verb: spec.verb,
        takesQuery: spec.verb === 'search',
        needsKey: spec.verb === 'read',
      })),
    });
  });

  app.get('/console/api/shortcuts', guardApi, async (_req, res) => {
    await handle(res, deps, async () => ({
      shortcuts: (await deps.management.listShortcuts()).map(toShortcutWire),
    }));
  });

  /** Creating. Editing uses PUT with the name being replaced, so a rename works. */
  app.post('/console/api/shortcuts', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const saved = await deps.management.saveShortcut(readShortcut(req.body));
      await deps.reload();
      return { shortcut: toShortcutWire(saved) };
    });
  });

  /** Runs a draft as it stands, with sample slot values, and saves nothing. */
  app.post('/console/api/shortcuts/try', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const body = (req.body ?? {}) as { shortcut?: unknown; inputs?: unknown };
      const props = readShortcut(body.shortcut);
      // A draft may not have a name yet, and trying it should not wait for one.
      const draft = new Shortcut({ ...props, name: props.name.trim() === '' ? 'test run' : props.name });
      const result = await deps.shortcutRunner.run(draft, readInputs(body.inputs));
      return { spoken: result.spoken, trace: result.trace };
    });
  });

  app.put('/console/api/shortcuts/:name', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const replacing = decodeURIComponent(req.params['name'] as string);
      const saved = await deps.management.saveShortcut(readShortcut(req.body), replacing);
      await deps.reload();
      return { shortcut: toShortcutWire(saved) };
    });
  });

  app.delete('/console/api/shortcuts/:name', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      await deps.management.removeShortcut(decodeURIComponent(req.params['name'] as string));
      await deps.reload();
      return { ok: true };
    });
  });

  // ---- keys --------------------------------------------------------------

  /** Names, and which apps use each. A value goes in and never comes back out. */
  app.get('/console/api/secrets', guardApi, async (_req, res) => {
    await handle(res, deps, async () => {
      const [names, apps] = await Promise.all([deps.secrets.names(), deps.management.list().catch(() => [])]);
      return {
        secrets: names.map((name) => ({
          name,
          usedBy: apps
            .filter((entry) => entry.sources.some((source) => source.secretNames().includes(name)))
            .map((entry) => entry.id),
        })),
      };
    });
  });

  app.put('/console/api/secrets/:name', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const name = req.params['name'] as string;
      const value = (req.body as { value?: unknown } | undefined)?.value;
      await deps.secrets.set(name, typeof value === 'string' ? value.trim() : '');
      deps.logger.info('secret saved', { name });
      return { name };
    });
  });

  app.delete('/console/api/secrets/:name', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const name = req.params['name'] as string;
      await deps.secrets.remove(name);
      deps.logger.info('secret removed', { name });
      return { name };
    });
  });

  // ---- settings ----------------------------------------------------------

  app.get('/console/api/settings', guardApi, (req, res) => {
    res.json(settingsWire(current, req));
  });

  app.put('/console/api/settings', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const next = readSettings(req.body, current);
      const backup = await deps.settingsStore.save(next);
      const restartRequired = JSON.stringify(deps.settings) !== JSON.stringify(next);
      current = next;
      deps.logger.info('settings saved', { restartRequired });
      return { ...settingsWire(current, req), backup, restartRequired };
    });
  });
}

// ---- helpers ---------------------------------------------------------------

async function handle(
  res: Response,
  deps: ConsoleDeps,
  run: () => Promise<Record<string, unknown>>,
): Promise<void> {
  try {
    res.json(await run());
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message, field: error.field });
      return;
    }
    if (error instanceof StackVoiceError) {
      res.status(error.code === 'APP_NOT_FOUND' ? 404 : 502).json({ error: error.message });
      return;
    }
    deps.logger.error('console request failed', { reason: String(error) });
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}

/** The token itself never leaves the server; the page only learns whether one is set. */
function settingsWire(settings: Settings, req: Request): Record<string, unknown> {
  const origin =
    settings.auth.publicUrl !== '' ? settings.auth.publicUrl : `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  return {
    settings: {
      server: settings.server,
      auth: { mode: settings.auth.mode, tokenSet: settings.auth.token !== '', publicUrl: settings.auth.publicUrl },
      console: settings.console,
      simulator: settings.simulator,
      sources: settings.sources,
      cache: settings.cache,
    },
    endpoints: { mcp: `${origin}/mcp`, console: `${origin}/console`, simulator: `${origin}/simulator` },
  };
}

function readSettings(body: unknown, previous: Settings): Settings {
  if (body === null || typeof body !== 'object') throw new ValidationError('expected an object', 'body');
  const raw = body as Record<string, Record<string, unknown> | undefined>;

  const server = raw['server'] ?? {};
  const auth = raw['auth'] ?? {};
  const cache = raw['cache'] ?? {};

  const host = typeof server['host'] === 'string' ? server['host'].trim() : '';
  if (host === '') throw new ValidationError('an address to listen on is required', 'server.host');

  const port = Number(server['port']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError('the port must be a whole number from 1 to 65535', 'server.port');
  }

  const logLevel = server['logLevel'];
  if (logLevel !== 'debug' && logLevel !== 'info' && logLevel !== 'warn' && logLevel !== 'error') {
    throw new ValidationError('choose a log level', 'server.logLevel');
  }

  const mode = auth['mode'];
  if (mode !== 'none' && mode !== 'token' && mode !== 'oauth') {
    throw new ValidationError('choose an access mode', 'auth.mode');
  }

  // An empty token field means "keep the one I have", so the page never has to
  // hold the secret to let someone change something else.
  const submittedToken = typeof auth['token'] === 'string' ? auth['token'] : '';
  const token = submittedToken === '' ? previous.auth.token : submittedToken;
  const publicUrl = typeof auth['publicUrl'] === 'string' ? auth['publicUrl'].trim().replace(/\/+$/, '') : '';

  if (mode !== 'none' && token === '') {
    throw new ValidationError('set an owner token before turning access control on', 'auth.token');
  }
  if (mode === 'oauth' && !/^https?:\/\//.test(publicUrl)) {
    throw new ValidationError('OAuth needs the public address this server is reached at', 'auth.publicUrl');
  }

  const ttl = Number(cache['ttlSeconds']);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 86_400) {
    throw new ValidationError('the cache must be between 0 and 86400 seconds', 'cache.ttlSeconds');
  }

  const sources = raw['sources'] ?? {};
  const dataDir =
    typeof sources['dataDir'] === 'string'
      ? sources['dataDir'].trim().replace(/\\/g, '/').replace(/\/+$/, '')
      : previous.sources.dataDir;
  // The folder in use was accepted when the server started; only a new one is checked.
  if (dataDir !== previous.sources.dataDir) {
    const problem = dataDirProblem(dataDir);
    if (problem !== null) throw new ValidationError(problem, 'sources.dataDir');
  }
  const allowPrivateNetwork =
    typeof sources['allowPrivateNetwork'] === 'boolean'
      ? sources['allowPrivateNetwork']
      : previous.sources.allowPrivateNetwork;

  return {
    server: { host, port, logLevel: logLevel as LogLevel },
    auth: { mode: mode as AuthMode, token, publicUrl },
    console: { enabled: (raw['console'] ?? {})['enabled'] !== false },
    simulator: { enabled: (raw['simulator'] ?? {})['enabled'] !== false },
    management: previous.management,
    sources: { allowPrivateNetwork, dataDir },
    cache: { ttlSeconds: ttl },
  };
}

/**
 * A data folder has to be a folder of its own inside the project. Pointed at the
 * project itself or at config/, a file source could read secrets.yml.
 */
function dataDirProblem(dataDir: string): string | null {
  const parts = dataDir.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.length === 0) return 'choose a folder of its own for data files, such as "data"';
  if (dataDir.startsWith('/') || /^[A-Za-z]:/.test(dataDir) || parts.includes('..')) {
    return 'the data folder must sit inside the StackVoice folder: no "..", drive letter or leading slash';
  }
  const top = (parts[0] as string).toLowerCase();
  if (top === 'config' || top === '.git' || top === 'node_modules') {
    return `"${parts[0] as string}" belongs to StackVoice itself; choose a folder of its own, such as "data"`;
  }
  return null;
}

function readSpec(id: string, body: unknown, previous: AppDefinition | null): AppSpec {
  if (body === null || typeof body !== 'object') throw new ValidationError('expected an object', 'body');
  const raw = body as Record<string, unknown>;

  const text = (name: string, fallback = ''): string => {
    const value = raw[name];
    return typeof value === 'string' ? value : fallback;
  };
  const optional = (source: Record<string, unknown>, name: string): string | null => {
    const value = source[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  const primitives = (raw['primitives'] ?? {}) as Record<string, unknown>;
  const fields = (raw['fields'] ?? {}) as Record<string, unknown>;
  const statusFields = (raw['statusFields'] ?? {}) as Record<string, unknown>;

  const key = optional(fields, 'key');
  const title = optional(fields, 'title');
  if (key === null || title === null) {
    throw new ValidationError('a key field and a title field are both required', 'fields');
  }

  return {
    id,
    label: text('label'),
    description: text('description'),
    enabled: raw['enabled'] !== false,
    primitives: {
      search: primitives['search'] === true,
      read: primitives['read'] === true,
      status: primitives['status'] === true,
    },
    location: readLocation(raw['location'], previous?.primarySource().location ?? null),
    itemsPath: optional(raw, 'itemsPath'),
    fields: {
      key,
      title,
      summary: optional(fields, 'summary'),
      date: optional(fields, 'date'),
      topic: optional(fields, 'topic'),
      region: optional(fields, 'region'),
      url: optional(fields, 'url'),
    },
    statusFields: {
      lastDataDate: optional(statusFields, 'lastDataDate') ?? DEFAULT_STATUS_FIELD_MAP.lastDataDate,
      itemCount: optional(statusFields, 'itemCount') ?? DEFAULT_STATUS_FIELD_MAP.itemCount,
    },
  };
}

/**
 * Where the data comes from, as the page sent it. The domain checks the rest when
 * the source is built, so a bad address or path still comes back as a 400.
 */
function readLocation(body: unknown, before: SourceLocation | null): SourceLocation {
  if (body === null || typeof body !== 'object') {
    throw new ValidationError('say where the data comes from', 'location');
  }
  const raw = body as Record<string, unknown>;
  const text = (name: string): string => (typeof raw[name] === 'string' ? (raw[name] as string).trim() : '');
  const format = text('format') as DataFormat;

  switch (raw['type']) {
    case 'github-repo': {
      const indexFile = text('indexFile') || 'data/views/index.json';
      const slash = indexFile.lastIndexOf('/');
      return {
        type: 'github-repo',
        repo: text('repo'),
        branch: text('branch') || 'main',
        viewsDir: slash === -1 ? '.' : indexFile.slice(0, slash),
        indexFile,
        statsFile: text('statsFile') || 'data/views/stats.json',
      };
    }
    case 'url': {
      const url = text('url');
      return { type: 'url', url, format, headers: headersFor(raw['headers'], url, before) };
    }
    case 'file':
      return { type: 'file', path: text('path'), format };
    default:
      throw new ValidationError('a source is a github-repo, a url or a file', 'location.type');
  }
}

/**
 * The headers to save. The page never holds header values, so when it sends none
 * the app keeps what it has. Not across sites, though: an app moved to another
 * host must not quietly carry its key along to the new one.
 */
function headersFor(sent: unknown, url: string, before: SourceLocation | null): Record<string, string> {
  if (sent !== undefined) return readHeaders(sent);
  if (before === null || before.type !== 'url' || Object.keys(before.headers).length === 0) return {};

  const origin = originOf(url);
  if (origin !== null && origin !== originOf(before.url)) {
    throw new ValidationError(
      'this address is on a different site from before, so its key was not carried over. Add the key again.',
      'location.headers',
    );
  }
  return { ...before.headers };
}

/** Header names and values from the page: a secret reference, or plain text such as a media type. */
function readHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('headers must be an object of names and values', 'headers');
  }
  const headers: Record<string, string> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'string') throw new ValidationError(`the "${name}" header needs a text value`, 'headers');
    headers[name.trim()] = entry.trim();
  }
  return headers;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** A shortcut from the page. Its blocks are checked for shape here, and for meaning by the domain. */
function readShortcut(body: unknown): ShortcutProps {
  if (body === null || typeof body !== 'object') throw new ValidationError('expected an object', 'body');
  const raw = body as Record<string, unknown>;

  const triggers = raw['triggers'] ?? [];
  if (!Array.isArray(triggers) || triggers.some((trigger) => typeof trigger !== 'string')) {
    throw new ValidationError('must be a list of phrases', 'triggers');
  }

  return {
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    enabled: raw['enabled'] !== false,
    triggers: triggers as string[],
    blocks: parseBlocks(raw['blocks']),
  };
}

/** Sample values for a draft's slots. Anything that is not text is ignored. */
function readInputs(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function toShortcutWire(shortcut: Shortcut): Record<string, unknown> {
  return {
    name: shortcut.name,
    description: shortcut.description,
    enabled: shortcut.enabled,
    toolName: shortcut.toolName,
    triggers: shortcut.triggers,
    slots: shortcut.slots,
    blocks: shortcut.blocks,
    tools: shortcut.requiredTools(),
  };
}

function toWire(entry: AppDefinition, knownSecrets: readonly string[]): Record<string, unknown> {
  const source = entry.primarySource();
  const secretNames = source.secretNames();
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    enabled: entry.enabled,
    primitives: entry.primitives,
    tools: entry.enabledVerbs().map((verb) => `${entry.id}_${verb}`),
    from: source.describe(),
    location: locationWire(source.location),
    secretNames,
    missingSecrets: secretNames.filter((name) => !knownSecrets.includes(name)),
    itemsPath: source.itemsPath,
    fields: source.fields,
    statusFields: source.statusFields,
  };
}

function toProposalWire(proposal: SourceProposal): Record<string, unknown> {
  return { ...proposal, location: locationWire(proposal.location) };
}

/**
 * A location safe to hand a browser. Header values stay on the server: one saved
 * through the console only references a secret, but one written into the app
 * file by hand may be the key itself.
 */
function locationWire(location: SourceLocation): Record<string, unknown> {
  if (location.type !== 'url') return { ...location };
  return {
    type: location.type,
    url: location.url,
    format: location.format,
    headers: Object.entries(location.headers).map(([name, value]) => describeHeader(name, value)),
  };
}

/** `Bearer {{secret:NOTION_KEY}}` becomes its scheme and secret name. Anything else is described by name alone. */
function describeHeader(name: string, value: string): { name: string; prefix: string | null; secret: string | null } {
  const match = /^(?:([A-Za-z][\w-]{0,19}) )?\{\{secret:([A-Z][A-Z0-9_]{0,63})\}\}$/.exec(value);
  if (match === null) return { name, prefix: null, secret: null };
  return { name, prefix: match[1] ?? '', secret: match[2] as string };
}

function matches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.header('cookie');
  if (header === undefined) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}
