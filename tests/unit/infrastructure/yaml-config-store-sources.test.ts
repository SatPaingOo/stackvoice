import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { AppDefinition } from '../../../src/domain/app-definition.js';
import {
  DataSource,
  DEFAULT_STATUS_FIELD_MAP,
  type FieldMap,
  type SourceLocation,
} from '../../../src/domain/data-source.js';
import { ConfigError } from '../../../src/domain/errors.js';
import { YamlConfigStore } from '../../../src/infrastructure/config/yaml-config-store.js';

const FIELDS: FieldMap = {
  key: 'id',
  title: 'title',
  summary: 'summary',
  date: 'date',
  topic: null,
  region: null,
  url: 'link',
};

let dir: string;
let store: YamlConfigStore;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'stackvoice-store-sources-'));
  dir = join(root, 'apps');
  await mkdir(dir, { recursive: true });
  store = new YamlConfigStore(dir, join(root, 'backups'));
});

const app = (
  location: SourceLocation,
  over: { fields?: Partial<FieldMap>; itemsPath?: string | null } = {},
): AppDefinition =>
  new AppDefinition({
    id: 'news',
    label: 'World news',
    description: 'Headlines from a feed.',
    enabled: true,
    primitives: { search: true, read: true, status: true },
    sources: [
      new DataSource({
        id: 'news',
        label: 'world news',
        itemsPath: over.itemsPath === undefined ? 'items' : over.itemsPath,
        fields: { ...FIELDS, ...over.fields },
        statusFields: DEFAULT_STATUS_FIELD_MAP,
        ...location,
      }),
    ],
  });

const writeApp = (lines: string[]): Promise<void> => writeFile(join(dir, 'news.yml'), `${lines.join('\n')}\n`, 'utf8');

const HEAD = ['id: news', 'label: "News"', 'description: "Headlines."', 'sources:', '  - id: news', '    label: "news"'];

describe('YamlConfigStore with url and file sources', () => {
  it('round-trips a url source with its query string and a secret header', async () => {
    const location: SourceLocation = {
      type: 'url',
      url: 'https://api.example.com/v1/items?limit=50&sort=new',
      format: 'json',
      headers: { Authorization: 'Bearer {{secret:NEWS_KEY}}', Accept: 'application/json' },
    };

    await store.saveApp(app(location));
    const loaded = (await store.getApp('news'))?.primarySource();

    expect(loaded?.location).toEqual(location);
    expect(loaded?.itemsPath).toBe('items');
    expect(loaded?.fields).toEqual(FIELDS);
  });

  it('round-trips a file source', async () => {
    const location: SourceLocation = { type: 'file', path: 'exports/prices.csv', format: 'csv' };

    await store.saveApp(app(location, { itemsPath: null }));

    expect((await store.getApp('news'))?.primarySource().location).toEqual(location);
  });

  it('quotes a template so it reads back as text rather than a map', async () => {
    await store.saveApp(
      app(
        { type: 'file', path: 'prices.csv', format: 'csv' },
        { itemsPath: null, fields: { key: 'Date', title: '{Date}: {Price}', date: 'Date', summary: null, url: null } },
      ),
    );

    expect(await readFile(join(dir, 'news.yml'), 'utf8')).toContain('title: "{Date}: {Price}"');
    expect((await store.getApp('news'))?.primarySource().fields.title).toBe('{Date}: {Price}');
  });

  it('keeps a column named like a YAML keyword as text', async () => {
    await store.saveApp(app({ type: 'file', path: 'flags.csv', format: 'csv' }, { fields: { topic: 'yes', region: 'null' } }));

    const fields = (await store.getApp('news'))?.primarySource().fields;

    expect(fields?.topic).toBe('yes');
    expect(fields?.region).toBe('null');
  });

  it('writes only what the source type uses', async () => {
    await store.saveApp(app({ type: 'url', url: 'https://news.example.com/rss.xml', format: 'rss', headers: {} }));

    const document = parseYaml(await readFile(join(dir, 'news.yml'), 'utf8')) as { sources: Record<string, unknown>[] };
    const [written] = document.sources;

    expect(written).toMatchObject({ type: 'url', format: 'rss' });
    expect(written).not.toHaveProperty('status_fields');
    expect(written).not.toHaveProperty('headers');
    expect(written).not.toHaveProperty('repo');
  });

  it('rejects a url source with no format, naming the field', async () => {
    await writeApp([...HEAD, '    type: url', '    url: "https://news.example.com/rss.xml"']);

    await expect(store.listApps()).rejects.toThrowError(/sources\.0\.format/);
  });

  it('rejects a file source that climbs out of the data directory', async () => {
    await writeApp([...HEAD, '    type: file', '    path: "../config/secrets.yml"', '    format: csv']);

    await expect(store.listApps()).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects credentials written into an address', async () => {
    await writeApp([...HEAD, '    type: url', '    url: "https://me:hunter2@api.example.com/items"', '    format: json']);

    await expect(store.listApps()).rejects.toThrowError(/credentials in a header/);
  });
});
