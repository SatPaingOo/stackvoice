import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

import type { HealthService } from '../../application/health.service.js';
import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import type { ToolCatalogService } from '../../application/tool-catalog.service.js';
import type { AppSpec, ManagementService } from '../../application/management.service.js';
import type { AppDefinition } from '../../domain/app-definition.js';
import { StackVoiceError, ValidationError } from '../../domain/errors.js';
import type { Shortcut, ShortcutProps, ShortcutStep } from '../../domain/shortcut.js';
import type { Logger } from '../../domain/ports/logger.js';
import { renderConsolePage } from './page.js';

export interface ConsoleDeps {
  readonly management: ManagementService;
  readonly health: HealthService;
  readonly catalog: ToolCatalogService;
  readonly registry: AppRegistryService;
  readonly shortcuts: ShortcutRegistryService;
  readonly logger: Logger;
  /** Empty means no sign-in: only ever the case when the server is bound to localhost. */
  readonly ownerToken: string;
  /** Reloads the registry so a save takes effect without a restart. */
  readonly reload: () => Promise<void>;
}

const SESSION_COOKIE = 'stackvoice_console';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The web console.
 *
 * A CLI means "any developer can add their data". A browser means "anyone can",
 * which is what the product actually claims. It is a thin adapter over
 * `ManagementService` — the same validation, the same backups, the same write
 * path as the CLI, because there is only one implementation of each operation.
 */
export function installConsole(app: Express, deps: ConsoleDeps): void {
  const sessions = new Map<string, number>();
  const requiresLogin = deps.ownerToken !== '';

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

  const guard: RequestHandler = (req, res, next: NextFunction) => {
    if (authorized(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'sign in first' });
  };

  app.get('/console', (req, res) => {
    res.type('html').send(renderConsolePage({ requiresLogin, signedIn: authorized(req) }));
  });

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

  /** Apps plus their health, so the dashboard is one request. */
  app.get('/console/api/apps', guard, async (_req, res) => {
    await handle(res, deps, async () => {
      const [apps, health] = await Promise.all([
        deps.management.list(),
        deps.health.reportStack(),
      ]);
      const healthById = new Map(health.apps.map((entry) => [entry.appId, entry]));

      return {
        apps: apps.map((app) => ({ ...toWire(app), health: healthById.get(app.id) ?? null })),
      };
    });
  });

  /** Previews a repository without writing anything. */
  app.post('/console/api/inspect', guard, async (req, res) => {
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

  app.put('/console/api/apps/:id', guard, async (req, res) => {
    await handle(res, deps, async () => {
      const spec = readSpec(req.params['id'] as string, req.body);
      const result = await deps.management.upsert(spec);
      await deps.reload();
      return { app: toWire(result.app), replaced: result.replaced };
    });
  });

  app.post('/console/api/apps/:id/enabled', guard, async (req, res) => {
    await handle(res, deps, async () => {
      const enabled = (req.body as { enabled?: unknown }).enabled === true;
      const app = await deps.management.setEnabled(req.params['id'] as string, enabled);
      await deps.reload();
      return { app: toWire(app) };
    });
  });

  /**
   * Every tool a shortcut could call, so the console offers a list rather than
   * asking someone to remember tool names.
   */
  app.get('/console/api/tools', guard, (_req, res) => {
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

  app.get('/console/api/shortcuts', guard, async (_req, res) => {
    await handle(res, deps, async () => ({
      shortcuts: (await deps.management.listShortcuts()).map(toShortcutWire),
    }));
  });

  /** Creating. Editing uses PUT with the name being replaced, so a rename works. */
  app.post('/console/api/shortcuts', guard, async (req, res) => {
    await handle(res, deps, async () => {
      const saved = await deps.management.saveShortcut(readShortcut(req.body));
      await deps.reload();
      return { shortcut: toShortcutWire(saved) };
    });
  });

  app.put('/console/api/shortcuts/:name', guard, async (req, res) => {
    await handle(res, deps, async () => {
      const props = readShortcut(req.body);
      const replacing = decodeURIComponent(req.params['name'] as string);
      const saved = await deps.management.saveShortcut(props, replacing);
      await deps.reload();
      return { shortcut: toShortcutWire(saved) };
    });
  });

  app.delete('/console/api/shortcuts/:name', guard, async (req, res) => {
    await handle(res, deps, async () => {
      await deps.management.removeShortcut(decodeURIComponent(req.params['name'] as string));
      await deps.reload();
      return { ok: true };
    });
  });

  app.delete('/console/api/apps/:id', guard, async (req, res) => {
    await handle(res, deps, async () => {
      const backup = await deps.management.remove(req.params['id'] as string);
      await deps.reload();
      return { backup };
    });
  });
}

/** Runs a handler, turning typed domain errors into the right status. */
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
      const status = error.code === 'APP_NOT_FOUND' ? 404 : 502;
      res.status(status).json({ error: error.message });
      return;
    }
    deps.logger.error('console request failed', { reason: String(error) });
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}

/** Validates the shape the browser sent; the service validates the meaning. */
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

/** Validates the shape the browser sent; the entity validates the meaning. */
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

function toWire(app: AppDefinition): Record<string, unknown> {
  const source = app.primarySource();
  return {
    id: app.id,
    label: app.label,
    description: app.description,
    enabled: app.enabled,
    primitives: app.primitives,
    tools: app.enabledVerbs().map((verb) => `${app.id}_${verb}`),
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
