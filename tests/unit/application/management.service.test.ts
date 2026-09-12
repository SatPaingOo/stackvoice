import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ManagementService } from '../../../src/application/management.service.js';
import { AppNotFoundError, SourceUnavailableError, ValidationError } from '../../../src/domain/errors.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import type { SourceInspector, SourceTarget } from '../../../src/domain/ports/source-inspector.js';
import type { SourceProposal } from '../../../src/domain/source-proposal.js';
import { YamlConfigStore } from '../../../src/infrastructure/config/yaml-config-store.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const proposal = (over: Partial<SourceProposal> = {}): SourceProposal => ({
  location: {
    type: 'github-repo',
    repo: 'owner/name',
    branch: 'main',
    viewsDir: 'data/views',
    indexFile: 'data/views/index.json',
    statsFile: 'data/views/stats.json',
  },
  suggestedLabel: null,
  itemsPath: null,
  itemCount: 12,
  fields: {
    key: 'key',
    title: 'title',
    summary: 'tldr',
    date: 'date',
    topic: null,
    region: null,
    url: 'source_url',
  },
  statusFields: { lastDataDate: 'last_date', itemCount: 'total_items' },
  suggestedPrimitives: { search: true, read: true, status: true },
  evidence: [],
  availableKeys: ['date', 'key', 'source_url', 'title', 'tldr'],
  triedPaths: [],
  ...over,
});

const inspectorReturning = (value: SourceProposal | Error): SourceInspector => ({
  inspect: async () => {
    if (value instanceof Error) throw value;
    return value;
  },
});

let dir: string;
let backups: string;

const build = (inspector: SourceInspector = inspectorReturning(proposal())): ManagementService =>
  new ManagementService(new YamlConfigStore(dir, backups), inspector, silentLogger);

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackvoice-mgmt-'));
  dir = join(root, 'apps');
  backups = join(root, 'backups');
  await mkdtemp(join(tmpdir(), 'unused-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
});

describe('addFromRepo', () => {
  it('writes a file whose name matches the app id', async () => {
    await build().addFromRepo({ id: 'weather', repo: 'owner/name' });

    expect(await readdir(dir)).toEqual(['weather.yml']);
  });

  it('writes the inferred mapping into the file', async () => {
    await build().addFromRepo({ id: 'weather', repo: 'owner/name' });

    const yaml = await readFile(join(dir, 'weather.yml'), 'utf8');
    expect(yaml).toContain('summary: tldr');
    expect(yaml).toContain('url: source_url');
    expect(yaml).toContain('topic: null');
  });

  it('reads back through the store, so the generated file is valid config', async () => {
    const service = build();
    await service.addFromRepo({ id: 'weather', repo: 'owner/name' });

    const app = await service.show('weather');

    expect(app.primarySource().fields.summary).toBe('tldr');
    expect(app.enabledVerbs()).toEqual(['search', 'read', 'status']);
  });

  it('takes the verbs the data supports', async () => {
    const service = build(
      inspectorReturning(proposal({ suggestedPrimitives: { search: true, read: false, status: true } })),
    );

    const result = await service.addFromRepo({ id: 'weather', repo: 'owner/name' });

    expect(result.app.enabledVerbs()).toEqual(['search', 'status']);
  });

  it('derives a readable label from the repository name', async () => {
    const result = await build().addFromRepo({ id: 'hub', repo: 'SatPaingOo/information-hub' });

    expect(result.app.label).toBe('Information hub');
  });

  it('keeps an explicit label and description', async () => {
    const result = await build().addFromRepo({
      id: 'hub',
      repo: 'owner/name',
      label: 'My notes',
      description: 'Notes I keep.',
    });

    expect(result.app.label).toBe('My notes');
    expect(result.app.description).toBe('Notes I keep.');
  });

  it('rejects an id that could not become a tool name', async () => {
    await expect(build().addFromRepo({ id: 'My_App', repo: 'owner/name' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('writes nothing when the repository cannot be inspected', async () => {
    const service = build(inspectorReturning(new SourceUnavailableError('owner/name', 'no read model')));

    await expect(service.addFromRepo({ id: 'weather', repo: 'owner/name' })).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it('backs up what it replaces', async () => {
    const service = build();
    await service.addFromRepo({ id: 'weather', repo: 'owner/name', label: 'First' });

    const second = await service.addFromRepo({ id: 'weather', repo: 'owner/name', label: 'Second' });

    expect(second.replaced).toBe(true);
    expect(second.backupPath).not.toBeNull();
    expect(await readFile(second.backupPath as string, 'utf8')).toContain('First');
  });
});

describe('addFromSource', () => {
  const feed = (): SourceProposal =>
    proposal({
      location: { type: 'url', url: 'https://news.example.com/rss.xml', format: 'rss', headers: {} },
      suggestedLabel: 'Example News',
      itemsPath: 'items',
    });

  const recording = (answer: SourceProposal, seen: SourceTarget[]): SourceInspector => ({
    inspect: async (target) => {
      seen.push(target);
      return answer;
    },
  });

  it('works out what was pasted before inspecting it', async () => {
    const seen: SourceTarget[] = [];
    const service = build(recording(feed(), seen));
    const headers = { Authorization: 'Bearer {{secret:NEWS_KEY}}' };

    await service.addFromSource({ id: 'news', input: 'https://news.example.com/rss.xml', headers });
    await service.addFromSource({ id: 'hub', input: 'owner/name', branch: 'gh-pages' });
    await service.addFromSource({ id: 'prices', input: 'exports/prices.csv', branch: 'ignored' });

    expect(seen).toEqual([
      { type: 'url', url: 'https://news.example.com/rss.xml', headers },
      { type: 'github-repo', repo: 'owner/name', branch: 'gh-pages' },
      { type: 'file', path: 'exports/prices.csv' },
    ]);
  });

  it('names the app after the feed when the feed names itself', async () => {
    const result = await build(inspectorReturning(feed())).addFromSource({
      id: 'news',
      input: 'https://news.example.com/rss.xml',
    });

    expect(result.app.label).toBe('Example News');
  });

  it('writes a url source that reads back through the store', async () => {
    const service = build(inspectorReturning(feed()));
    await service.addFromSource({ id: 'news', input: 'https://news.example.com/rss.xml' });

    const source = (await service.show('news')).primarySource();

    expect(source.location).toEqual({ type: 'url', url: 'https://news.example.com/rss.xml', format: 'rss', headers: {} });
    expect(source.itemsPath).toBe('items');
  });

  it('derives a label from a file name when the data has no name of its own', async () => {
    const file = proposal({ location: { type: 'file', path: 'gold_prices.csv', format: 'csv' } });

    const result = await build(inspectorReturning(file)).addFromSource({ id: 'gold', input: 'gold_prices.csv' });

    expect(result.app.label).toBe('Gold prices');
  });

  it('refuses an empty box before looking at anything', async () => {
    const seen: SourceTarget[] = [];

    await expect(build(recording(feed(), seen)).addFromSource({ id: 'news', input: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(seen).toEqual([]);
  });
});

describe('enable and disable', () => {
  it('flips the flag and keeps everything else', async () => {
    const service = build();
    await service.addFromRepo({ id: 'weather', repo: 'owner/name' });

    const disabled = await service.setEnabled('weather', false);

    expect(disabled.enabled).toBe(false);
    expect(disabled.primarySource().fields.summary).toBe('tldr');
    expect((await service.show('weather')).enabled).toBe(false);
  });

  it('refuses an app that does not exist', async () => {
    await expect(build().setEnabled('nope', false)).rejects.toBeInstanceOf(AppNotFoundError);
  });
});

describe('remove', () => {
  it('deletes the file and keeps a backup', async () => {
    const service = build();
    await service.addFromRepo({ id: 'weather', repo: 'owner/name' });

    const backup = await service.remove('weather');

    expect(await readdir(dir)).toEqual([]);
    expect(await readFile(backup, 'utf8')).toContain('id: weather');
  });

  it('refuses an app that does not exist', async () => {
    await expect(build().remove('nope')).rejects.toBeInstanceOf(AppNotFoundError);
  });
});

describe('validate', () => {
  it('passes a config it just wrote', async () => {
    const service = build();
    await service.addFromRepo({ id: 'weather', repo: 'owner/name' });

    expect(await service.validate()).toEqual([{ appId: 'weather', ok: true, problem: null }]);
  });

  it('reports a broken file instead of throwing', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'broken.yml'), 'id: broken\nlabel: "x"\n', 'utf8');

    const [report] = await build().validate();

    expect(report?.ok).toBe(false);
    expect(report?.problem).toMatch(/broken\.yml/);
  });

  it('reports one named app that does not exist', async () => {
    const [report] = await build().validate('nope');

    expect(report).toEqual({ appId: 'nope', ok: false, problem: 'No app is configured with id "nope".' });
  });
});
