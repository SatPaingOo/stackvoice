import { mkdir, mkdtemp } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManagementService } from '../../../src/application/management.service.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import type { SourceInspector, SourceTarget } from '../../../src/domain/ports/source-inspector.js';
import type { Settings } from '../../../src/domain/settings.js';
import type { SourceProposal } from '../../../src/domain/source-proposal.js';
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
  server: { host: '127.0.0.1', port: 8765, logLevel: 'warn' },
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
let secrets: YamlSecretStore;
let inspected: SourceTarget[];
let savedSettings: Settings[];

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

  const deps = {
    management: new ManagementService(
      new YamlConfigStore(join(root, 'apps'), join(root, 'backups')),
      inspector,
      silentLogger,
      undefined as never,
    ),
    health: { reportStack: async () => ({ apps: [] }) },
    catalog: {},
    registry: {},
    shortcuts: {},
    logger: silentLogger,
    ownerToken: '',
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
  } as unknown as ConsoleDeps;

  const app = express();
  app.use(express.json());
  installConsole(app, deps);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  await stop();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: Json }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: text === '' ? null : JSON.parse(text) };
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

const firstApp = async (): Promise<Json> => (await call('GET', '/console/api/apps')).json.apps[0];

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
  const withKey = { type: 'url', url: PROJECTS, format: 'json', headers: { Authorization: 'Bearer {{secret:PROJECTS_KEY}}' } };

  it('shows a saved header by its scheme and key name, and which app uses the key', async () => {
    await call('PUT', '/console/api/secrets/PROJECTS_KEY', { value: 'sk-live-123' });
    expect((await call('PUT', '/console/api/apps/projects', urlApp(withKey))).status).toBe(200);

    const app = await firstApp();
    const keys = await call('GET', '/console/api/secrets');

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

    const listed = await call('GET', '/console/api/apps');

    expect(listed.json.apps[0].location.headers).toEqual([{ name: 'X-Api-Key', prefix: null, secret: null }]);
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

    const moved = await call('PUT', '/console/api/apps/projects', urlApp({ type: 'url', url: 'https://elsewhere.example.net/x', format: 'json' }));

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
    const saved = await call('PUT', '/console/api/apps/prices', urlApp({ type: 'file', path: '../config/secrets.yml', format: 'csv' }));

    expect(saved.status).toBe(400);
  });
});

describe('inspect', () => {
  it('passes the pasted headers on and describes them back without values', async () => {
    const headers = { Authorization: 'Token {{secret:PROJECTS_KEY}}' };

    const result = await call('POST', '/console/api/inspect', { input: PROJECTS, headers });

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
    expect((await call('GET', '/console/api/settings')).json.settings.sources).toEqual({
      allowPrivateNetwork: false,
      dataDir: 'data',
    });
  });

  it('saves a new data folder and private network access', async () => {
    const saved = await call('PUT', '/console/api/settings', body({ dataDir: 'exports/', allowPrivateNetwork: true }));

    expect(saved.status).toBe(200);
    expect(saved.json.restartRequired).toBe(true);
    expect(savedSettings[0]?.sources).toEqual({ allowPrivateNetwork: true, dataDir: 'exports' });
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
