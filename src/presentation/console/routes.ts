import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { HealthService } from '../../application/health.service.js';
import type { AppSpec, ManagementService } from '../../application/management.service.js';
import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import type { ToolCatalogService } from '../../application/tool-catalog.service.js';
import type { AppDefinition } from '../../domain/app-definition.js';
import { StackVoiceError, ValidationError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SettingsStore } from '../../domain/ports/settings-store.js';
import type { AuthMode, LogLevel, Settings } from '../../domain/settings.js';
import type { Shortcut, ShortcutProps, ShortcutStep } from '../../domain/shortcut.js';
import { renderLandingPage } from '../web/landing.js';
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
  readonly logger: Logger;
  /** Empty means no sign-in: only ever the case when the server is bound to localhost. */
  readonly ownerToken: string;
  /** Reloads the registries so a save takes effect without a restart. */
  readonly reload: () => Promise<void>;
  /** The settings the process started with, and where to write changes. */
  readonly settings: Settings;
  readonly settingsStore: SettingsStore;
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
      const [apps, health] = await Promise.all([deps.management.list(), deps.health.reportStack()]);
      const healthById = new Map(health.apps.map((entry) => [entry.appId, entry]));
      return { apps: apps.map((entry) => ({ ...toWire(entry), health: healthById.get(entry.id) ?? null })) };
    });
  });

  app.post('/console/api/inspect', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const body = req.body as { repo?: unknown; branch?: unknown };
      const repo = typeof body.repo === 'string' ? body.repo.trim() : '';
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        throw new ValidationError('give a repository as owner/name', 'repo');
      }
      const branch = typeof body.branch === 'string' && body.branch !== '' ? body.branch : undefined;
      return { proposal: await deps.management.inspect(repo, branch) };
    });
  });

  app.put('/console/api/apps/:id', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const result = await deps.management.upsert(readSpec(req.params['id'] as string, req.body));
      await deps.reload();
      return { app: toWire(result.app), replaced: result.replaced };
    });
  });

  app.post('/console/api/apps/:id/enabled', guardApi, async (req, res) => {
    await handle(res, deps, async () => {
      const enabled = (req.body as { enabled?: unknown }).enabled === true;
      const updated = await deps.management.setEnabled(req.params['id'] as string, enabled);
      await deps.reload();
      return { app: toWire(updated) };
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

  return {
    server: { host, port, logLevel: logLevel as LogLevel },
    auth: { mode: mode as AuthMode, token, publicUrl },
    console: { enabled: (raw['console'] ?? {})['enabled'] !== false },
    simulator: { enabled: (raw['simulator'] ?? {})['enabled'] !== false },
    management: previous.management,
    cache: { ttlSeconds: ttl },
  };
}

function readSpec(id: string, body: unknown): AppSpec {
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
    repo: text('repo').trim(),
    indexFile: text('indexFile', 'data/views/index.json').trim(),
    statsFile: text('statsFile', 'data/views/stats.json').trim(),
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
      lastDataDate: optional(statusFields, 'lastDataDate') ?? 'last_date',
      itemCount: optional(statusFields, 'itemCount') ?? 'total_items',
    },
  };
}

function readShortcut(body: unknown): ShortcutProps {
  if (body === null || typeof body !== 'object') throw new ValidationError('expected an object', 'body');
  const raw = body as Record<string, unknown>;

  const rawSteps = Array.isArray(raw['steps']) ? raw['steps'] : [];
  const steps: ShortcutStep[] = rawSteps.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new ValidationError(`step ${index + 1} is not a step`, 'steps');
    }
    const step = entry as Record<string, unknown>;
    const tool = typeof step['tool'] === 'string' ? step['tool'].trim() : '';
    if (tool === '') throw new ValidationError(`step ${index + 1} has no tool`, 'steps');

    const args = step['args'];
    if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
      throw new ValidationError(`step ${index + 1} has arguments that are not an object`, 'steps');
    }
    return { tool, args: (args as Record<string, unknown> | undefined) ?? {} };
  });

  return {
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    reply: typeof raw['reply'] === 'string' ? raw['reply'] : '',
    enabled: raw['enabled'] !== false,
    steps,
  };
}

function toShortcutWire(shortcut: Shortcut): Record<string, unknown> {
  return {
    name: shortcut.name,
    description: shortcut.description,
    enabled: shortcut.enabled,
    reply: shortcut.reply,
    toolName: shortcut.toolName,
    steps: shortcut.steps.map((step) => ({ tool: step.tool, args: step.args })),
  };
}

function toWire(entry: AppDefinition): Record<string, unknown> {
  const source = entry.primarySource();
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    enabled: entry.enabled,
    primitives: entry.primitives,
    tools: entry.enabledVerbs().map((verb) => `${entry.id}_${verb}`),
    repo: source.repo,
    indexFile: source.indexFile,
    statsFile: source.statsFile,
    itemsPath: source.itemsPath,
    fields: source.fields,
    statusFields: source.statusFields,
  };
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
