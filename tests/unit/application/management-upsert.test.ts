import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ManagementService, type AppSpec } from '../../../src/application/management.service.js';
import { ValidationError } from '../../../src/domain/errors.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import type { SourceInspector } from '../../../src/domain/ports/source-inspector.js';
import { YamlConfigStore } from '../../../src/infrastructure/config/yaml-config-store.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

/** Upsert never inspects: the caller already knows what it wants written. */
const neverInspects: SourceInspector = {
  inspect: async () => {
    throw new Error('upsert must not inspect');
  },
};

const GITHUB = {
  type: 'github-repo',
  repo: 'me/notes',
  branch: 'main',
  viewsDir: 'data/views',
  indexFile: 'data/views/index.json',
  statsFile: 'data/views/stats.json',
} as const;

const spec = (over: Partial<AppSpec> = {}): AppSpec => ({
  id: 'notes',
  label: 'My notes',
  description: 'Things I wrote down.',
  enabled: true,
  primitives: { search: true, read: true, status: true },
  location: GITHUB,
  itemsPath: null,
  fields: {
    key: 'id',
    title: 'heading',
    summary: null,
    date: 'created_at',
    topic: null,
    region: null,
    url: null,
  },
  statusFields: { lastDataDate: 'updated_at', itemCount: 'total' },
  ...over,
});

let dir: string;
let backups: string;
let service: ManagementService;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackvoice-upsert-'));
  dir = join(root, 'apps');
  backups = join(root, 'backups');
  await mkdir(dir, { recursive: true });
  service = new ManagementService(new YamlConfigStore(dir, backups), neverInspects, silentLogger);
});

describe('ManagementService.upsert', () => {
  it('writes exactly what it was given', async () => {
    await service.upsert(spec());

    const app = await service.show('notes');
    const source = app.primarySource();
    expect(source.fields.title).toBe('heading');
    expect(source.fields.summary).toBeNull();
    expect(source.statusFields).toEqual({ lastDataDate: 'updated_at', itemCount: 'total' });
  });

  it('writes a url source with its format and a secret header', async () => {
    const location = {
      type: 'url',
      url: 'https://api.example.com/v1/notes',
      format: 'json',
      headers: { Authorization: 'Bearer {{secret:NOTES_KEY}}' },
    } as const;

    await service.upsert(spec({ location }));

    const source = (await service.show('notes')).primarySource();
    expect(source.location).toEqual(location);
    expect(source.secretNames()).toEqual(['NOTES_KEY']);
  });

  it('writes a file source', async () => {
    await service.upsert(spec({ location: { type: 'file', path: 'exports/notes.csv', format: 'csv' } }));

    expect((await service.show('notes')).primarySource().location).toEqual({
      type: 'file',
      path: 'exports/notes.csv',
      format: 'csv',
    });
  });

  it('keeps a template title intact through the file', async () => {
    await service.upsert(spec({ fields: { ...spec().fields, key: 'Date', title: '{Date}: {Price}' } }));

    expect((await service.show('notes')).primarySource().fields.title).toBe('{Date}: {Price}');
  });

  it('refuses a file source that climbs out of the data directory', async () => {
    await expect(
      service.upsert(spec({ location: { type: 'file', path: '../config/secrets.yml', format: 'csv' } })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('round-trips a nested items path', async () => {
    await service.upsert(spec({ itemsPath: 'recent_events' }));

    expect((await service.show('notes')).primarySource().itemsPath).toBe('recent_events');
  });

  it('exposes only the verbs that were asked for', async () => {
    await service.upsert(spec({ primitives: { search: true, read: false, status: false } }));

    expect((await service.show('notes')).enabledVerbs()).toEqual(['search']);
  });

  it('replaces an existing app and keeps a backup', async () => {
    await service.upsert(spec({ label: 'First' }));

    const second = await service.upsert(spec({ label: 'Second' }));

    expect(second.replaced).toBe(true);
    expect(await readFile(second.backupPath as string, 'utf8')).toContain('First');
    expect((await service.show('notes')).label).toBe('Second');
  });

  it('rejects an id that could not become a tool name', async () => {
    await expect(service.upsert(spec({ id: 'Not Valid' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an empty label', async () => {
    await expect(service.upsert(spec({ label: '   ' }))).rejects.toThrowError(/label is required/);
  });

  it('rejects an empty description, because the assistant reads it to route', async () => {
    await expect(service.upsert(spec({ description: '' }))).rejects.toThrowError(/description is required/);
  });

  it('rejects a repository that is not owner/name', async () => {
    await expect(service.upsert(spec({ location: { ...GITHUB, repo: 'not-a-repo' } }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('writes a file the loader accepts', async () => {
    await service.upsert(spec());

    const reports = await service.validate();

    expect(reports).toEqual([{ appId: 'notes', ok: true, problem: null }]);
  });
});
