import { mkdir, mkdtemp } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManagementService } from '../../../src/application/management.service.js';
import { ShortcutService } from '../../../src/application/shortcut.service.js';
import { ToolCatalogService } from '../../../src/application/tool-catalog.service.js';
import type { ToolRunner } from '../../../src/application/tool-runner.service.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import type { ShortcutStore } from '../../../src/domain/ports/shortcut-store.js';
import type { SourceInspector, SourceTarget } from '../../../src/domain/ports/source-inspector.js';
import type { Settings } from '../../../src/domain/settings.js';
import type { Shortcut } from '../../../src/domain/shortcut.js';
import type { SourceProposal } from '../../../src/domain/source-proposal.js';
import { AttemptLimiter } from '../../../src/infrastructure/auth/attempt-limiter.js';
import { YamlConfigStore } from '../../../src/infrastructure/config/yaml-config-store.js';
import { YamlSecretStore } from '../../../src/infrastructure/config/yaml-secret-store.js';
import { installConsole, type ConsoleDeps } from '../../../src/presentation/console/routes.js';

/**
 * The console API against real stores in a temporary directory. What matters
 * most here is what never leaves the server: key values and header values.
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const SETTINGS: Settings = {
  server: { host: '127.0.0.1', port: 8765, logLevel: 'warn', trustedProxies: 1 },
  management: { cli: true },
  auth: { mode: 'none', token: '', publicUrl: '' },
  console: { enabled: true },
  simulator: { enabled: true },
  sources: { allowPrivateNetwork: false, dataDir: 'data' },
  cache: { ttlSeconds: 300 },
};

const PROJECTS = 'https://api.example.com/v1/projects';

let base: string;
let stop: () => Promise<void>;
let baseDeps: ConsoleDeps;
let secrets: YamlSecretStore;
let inspected: SourceTarget[];
let savedSettings: Settings[];
let savedShortcuts: Shortcut[];

/** Answers every inspection with the target's own location, so the wire format can be checked. */
const inspector: SourceInspector = {
  inspect: async (target) => {
    inspected.push(target);
    return {
      location:
        target.type === 'url'
          ? { type: 'url', url: target.url, format: 'json', headers: { ...(target.headers ?? {}) } }
          : { type: 'file', path: 'x.csv', format: 'csv' },
      suggestedLabel: null,
      itemsPath: null,
      itemCount: 1,
      fields: { key: 'id', title: 'name', summary: null, date: null, topic: null, region: null, url: null },
      statusFields: { lastDataDate: 'last_date', itemCount: 'total_items' },
      suggestedPrimitives: { search: true, read: true, status: true },
      evidence: [],
      availableKeys: ['id', 'name'],
      triedPaths: [],
    } satisfies SourceProposal;
  },
};

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackvoice-console-'));
  await mkdir(join(root, 'apps'), { recursive: true });
  // An empty environment, so no STACKVOICE_SECRET_* on the machine leaks in.
  secrets = new YamlSecretStore(join(root, 'secrets.yml'), {});
  inspected = [];
  savedSettings = [];
  savedShortcuts = [];
  const shortcutStore: ShortcutStore = {
    list: async () => savedShortcuts,
    save: async (next) => {
      savedShortcuts = [...next];
      return null;
    },
  };

  baseDeps = {
    management: new ManagementService(
      new YamlConfigStore(join(root, 'apps'), join(root, 'backups')),
      inspector,
      silentLogger,
      shortcutStore,
    ),
    health: { reportStack: async () => ({ apps: [] }) },
    catalog: new ToolCatalogService(),
    registry: { list: () => [] },
    shortcuts: {},
    logger: silentLogger,
    ownerToken: '',
    attempts: new AttemptLimiter({ maxFailures: 3, windowMs: 60_000 }),
    reload: async () => {},
    settings: SETTINGS,
    settingsStore: {
      load: async () => SETTINGS,
      save: async (next: Settings) => {
        savedSettings.push(next);
        return null;
      },
    },
    secrets,
    assetsDir: root,
    // Flows in these tests ask no tools, so a runner that would answer is never reached.
    shortcutRunner: new ShortcutService(
      { run: async () => ({ spoken: 'unused', structured: null }) } as unknown as ToolRunner,
      silentLogger,
      () => new Date('2026-09-13T10:00:00Z'),
    ),
  } as unknown as ConsoleDeps;

  await serve(baseDeps);
});

/** Serves the console with these deps on a fresh port. */
async function serve(deps: ConsoleDeps): Promise<void> {
  const app = express();
  app.use(express.json());
  installConsole(app, deps);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
}

afterEach(async () => {
  await stop();
});

/** The fields of an app these tests read. */
interface AppBody {
  location: { url?: string; headers?: unknown };
  from: string;
  missingSecrets: string[];
}

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; text: string; json: T }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: (text === '' ? null : JSON.parse(text)) as T };
}

const urlApp = (location: Record<string, unknown>, label = 'Projects') => ({
  label,
  description: 'Projects from an API.',
  enabled: true,
  primitives: { search: true, read: true, status: true },
  location,
  itemsPath: 'data.items',
  fields: { key: 'id', title: 'name', summary: null, date: null, topic: null, region: null, url: null },
  statusFields: {},
});

const firstApp = async (): Promise<AppBody> =>
  (await call<{ apps: AppBody[] }>('GET', '/console/api/apps')).json.apps[0] as AppBody;

describe('sign-in', () => {
  const OWNER_TOKEN = 'owner-secret';

  // The limiter in the base deps allows three wrong tokens per window.
  beforeEach(async () => {
    await stop();
    await serve({ ...baseDeps, ownerToken: OWNER_TOKEN });
  });

  const signIn = (token: string, headers: Record<string, string> = {}): Promise<globalThis.Response> =>
    fetch(`${base}/console/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ token }),
    });

  it('refuses a wrong token', async () => {
    const response = await signIn('guess');

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('locks the address out after too many wrong tokens, even for the right one', async () => {
    for (const guess of ['one', 'two', 'three']) expect((await signIn(guess)).status).toBe(401);

    const locked = await signIn(OWNER_TOKEN);

    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await locked.json()) as { error: string }).error).toMatch(/Too many wrong tokens.*1 minute\./);
    expect(locked.headers.get('set-cookie')).toBeNull();
  });

  it('does not count an empty box as a guess', async () => {
    for (let i = 0; i < 5; i += 1) expect((await signIn('')).status).toBe(401);

    expect((await signIn(OWNER_TOKEN)).status).toBe(200);
  });

  it('clears the count when the right token arrives', async () => {
    for (const guess of ['one', 'two']) await signIn(guess);
    expect((await signIn(OWNER_TOKEN)).status).toBe(200);
    for (const guess of ['three', 'four']) await signIn(guess);

    expect((await signIn(OWNER_TOKEN)).status).toBe(200);
  });

  it('marks the session cookie Secure when the browser came over https', async () => {
    const response = await signIn(OWNER_TOKEN, { 'x-forwarded-proto': 'https' });

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^stackvoice_console=/);
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('; HttpOnly');
    expect(cookie).toContain('; SameSite=Strict');
  });

  it('leaves Secure off over plain http, where a browser would not keep the cookie', async () => {
    const response = await signIn(OWNER_TOKEN);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
  });
});

describe('keys', () => {
  it('stores a key and lists its name, never its value', async () => {
    const put = await call('PUT', '/console/api/secrets/PROJECTS_KEY', { value: '  sk-live-123  ' });
    const listed = await call('GET', '/console/api/secrets');

    expect(put.status).toBe(200);
    expect(put.text).not.toContain('sk-live-123');
    expect(await secrets.get('PROJECTS_KEY')).toBe('sk-live-123');
    expect(listed.json).toEqual({ secrets: [{ name: 'PROJECTS_KEY', usedBy: [] }] });
    expect(listed.text).not.toContain('sk-live-123');
  });

  it('refuses a key name that could not be referenced', async () => {
    expect((await call('PUT', '/console/api/secrets/lower_case', { value: 'x' })).status).toBe(400);
  });

  it('refuses an empty key', async () => {
    expect((await call('PUT', '/console/api/secrets/EMPTY_KEY', { value: '   ' })).status).toBe(400);
  });

  it('removes a key', async () => {
    await call('PUT', '/console/api/secrets/OLD_KEY', { value: 'x' });

    await call('DELETE', '/console/api/secrets/OLD_KEY');

    expect(await secrets.names()).toEqual([]);
  });
});

describe('apps with a url source', () => {
  const withKey = {
    type: 'url',
    url: PROJECTS,
    format: 'json',
    headers: { Authorization: 'Bearer {{secret:PROJECTS_KEY}}' },
  };

  it('shows a saved header by its scheme and key name, and which app uses the key', async () => {
    await call('PUT', '/console/api/secrets/PROJECTS_KEY', { value: 'sk-live-123' });
    expect((await call('PUT', '/console/api/apps/projects', urlApp(withKey))).status).toBe(200);

    const app = await firstApp();
    const keys = await call<{ secrets: unknown }>('GET', '/console/api/secrets');

    expect(app.location).toEqual({
      type: 'url',
      url: PROJECTS,
      format: 'json',
      headers: [{ name: 'Authorization', prefix: 'Bearer', secret: 'PROJECTS_KEY' }],
    });
    expect(app.from).toBe('api.example.com/v1/projects');
    expect(app.missingSecrets).toEqual([]);
    expect(keys.json.secrets).toEqual([{ name: 'PROJECTS_KEY', usedBy: ['projects'] }]);
  });

  it('never sends back a header value written as plain text', async () => {
    await call('PUT', '/console/api/apps/projects', urlApp({ ...withKey, headers: { 'X-Api-Key': 'raw-value-999' } }));

    const listed = await call<{ apps: AppBody[] }>('GET', '/console/api/apps');

    expect(listed.json.apps[0]?.location.headers).toEqual([{ name: 'X-Api-Key', prefix: null, secret: null }]);
    expect(listed.text).not.toContain('raw-value-999');
  });

  it('points out a key the app needs that the server does not have', async () => {
    await call('PUT', '/console/api/apps/projects', urlApp(withKey));

    expect((await firstApp()).missingSecrets).toEqual(['PROJECTS_KEY']);
  });

  it('keeps the saved headers when an edit sends none', async () => {
    await call('PUT', '/console/api/apps/projects', urlApp(withKey));
    const { headers: _dropped, ...withoutHeaders } = withKey;

    const edited = await call('PUT', '/console/api/apps/projects', urlApp(withoutHeaders, 'Renamed'));

    expect(edited.status).toBe(200);
    expect((await firstApp()).location.headers).toEqual([
      { name: 'Authorization', prefix: 'Bearer', secret: 'PROJECTS_KEY' },
    ]);
  });

  it('will not carry a key to a different site', async () => {
    await call('PUT', '/console/api/apps/projects', urlApp(withKey));

    const moved = await call<{ error: string }>(
      'PUT',
      '/console/api/apps/projects',
      urlApp({ type: 'url', url: 'https://elsewhere.example.net/x', format: 'json' }),
    );

    expect(moved.status).toBe(400);
    expect(moved.json.error).toMatch(/different site/);
    expect((await firstApp()).location.url).toBe(PROJECTS);
  });

  it('drops the headers when an edit sends an empty set', async () => {
    await call('PUT', '/console/api/apps/projects', urlApp(withKey));

    await call('PUT', '/console/api/apps/projects', urlApp({ ...withKey, headers: {} }));

    expect((await firstApp()).location.headers).toEqual([]);
  });

  it('refuses a file path outside the data folder', async () => {
    const saved = await call(
      'PUT',
      '/console/api/apps/prices',
      urlApp({ type: 'file', path: '../config/secrets.yml', format: 'csv' }),
    );

    expect(saved.status).toBe(400);
  });
});

describe('inspect', () => {
  it('passes the pasted headers on and describes them back without values', async () => {
    const headers = { Authorization: 'Token {{secret:PROJECTS_KEY}}' };

    const result = await call<{ proposal: { location: { headers: unknown } } }>('POST', '/console/api/inspect', {
      input: PROJECTS,
      headers,
    });

    expect(inspected).toEqual([{ type: 'url', url: PROJECTS, headers }]);
    expect(result.json.proposal.location.headers).toEqual([
      { name: 'Authorization', prefix: 'Token', secret: 'PROJECTS_KEY' },
    ]);
  });

  it('refuses an empty box', async () => {
    expect((await call('POST', '/console/api/inspect', { input: '' })).status).toBe(400);
  });
});

describe('settings: data sources', () => {
  const body = (sources: Record<string, unknown>) => ({
    server: { host: '127.0.0.1', port: 8765, logLevel: 'warn' },
    auth: { mode: 'none', token: '', publicUrl: '' },
    console: { enabled: true },
    simulator: { enabled: true },
    cache: { ttlSeconds: 300 },
    sources,
  });

  it('sends the data source settings to the page', async () => {
    expect(
      (await call<{ settings: { sources: unknown } }>('GET', '/console/api/settings')).json.settings.sources,
    ).toEqual({
      allowPrivateNetwork: false,
      dataDir: 'data',
    });
  });

  it('saves a new data folder and private network access', async () => {
    const saved = await call<{ restartRequired: boolean }>(
      'PUT',
      '/console/api/settings',
      body({ dataDir: 'exports/', allowPrivateNetwork: true }),
    );

    expect(saved.status).toBe(200);
    expect(saved.json.restartRequired).toBe(true);
    expect(savedSettings[0]?.sources).toEqual({ allowPrivateNetwork: true, dataDir: 'exports' });
  });

  it('keeps the proxy count, which the page has no field for', async () => {
    await call('PUT', '/console/api/settings', body({ dataDir: 'data', allowPrivateNetwork: false }));

    expect(savedSettings[0]?.server.trustedProxies).toBe(1);
  });

  it.each(['config', 'config/data', '..', '../elsewhere', '.', '/etc', 'C:/Users'])(
    'refuses %s as a data folder',
    async (dataDir) => {
      const saved = await call('PUT', '/console/api/settings', body({ dataDir, allowPrivateNetwork: false }));

      expect(saved.status).toBe(400);
      expect(savedSettings).toEqual([]);
    },
  );
});

describe('shortcuts', () => {
  const greet = {
    name: 'greet person',
    description: 'Says hello.',
    enabled: true,
    triggers: ['greet {person}'],
    blocks: [
      {
        kind: 'if',
        condition: { kind: 'text', template: '{person}', op: 'contains', value: 'sat' },
        then: [{ kind: 'say', text: 'Hello boss.' }],
        otherwise: [{ kind: 'say', text: 'Hello {person}.' }],
      },
    ],
  };

  it('saves a flow and sends it back with its slots and the tools it asks', async () => {
    expect((await call('POST', '/console/api/shortcuts', greet)).status).toBe(200);

    const listed = await call<{ shortcuts: Record<string, unknown>[] }>('GET', '/console/api/shortcuts');

    expect(listed.json.shortcuts[0]).toMatchObject({
      toolName: 'greet_person',
      triggers: ['greet {person}'],
      slots: ['person'],
      blocks: greet.blocks,
      tools: [],
    });
  });

  it('tries a draft with a value for each slot and returns the trace, saving nothing', async () => {
    const tried = await call<{ spoken: string; trace: { at: string; kind: string }[] }>(
      'POST',
      '/console/api/shortcuts/try',
      {
        shortcut: { ...greet, name: '' },
        inputs: { person: 'Sat Paing' },
      },
    );

    expect(tried.json.spoken).toBe('Hello boss.');
    expect(tried.json.trace.map((entry) => [entry.at, entry.kind])).toEqual([
      ['1', 'if'],
      ['1 › Then › 1', 'say'],
    ]);
    expect(savedShortcuts).toEqual([]);
  });

  it('names the block a mistake is in', async () => {
    const tried = await call<{ error: string }>('POST', '/console/api/shortcuts/try', {
      shortcut: { ...greet, blocks: [{ kind: 'say', text: '{nobody}' }] },
      inputs: {},
    });

    expect(tried.status).toBe(400);
    expect(tried.json.error).toMatch(/^blocks\.0\.text: \{nobody\} is used/);
  });

  it('refuses a shortcut sent without blocks', async () => {
    expect((await call('POST', '/console/api/shortcuts', { name: 'empty' })).status).toBe(400);
  });

  it('tells the builder what each tool is', async () => {
    const tools = await call<{ tools: { name: string; verb: string }[] }>('GET', '/console/api/tools');

    expect(tools.json.tools).toContainEqual(expect.objectContaining({ name: 'stack_status', verb: 'stack_status' }));
  });
});
