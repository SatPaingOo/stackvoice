import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
  type FieldMap,
  type SourceLocation,
} from '../../../src/domain/data-source.js';
import { SourceUnavailableError, ValidationError } from '../../../src/domain/errors.js';
import type { SecretStore } from '../../../src/domain/ports/secret-store.js';
import type { SourceInspector, SourceTarget } from '../../../src/domain/ports/source-inspector.js';
import type { SourceProposal } from '../../../src/domain/source-proposal.js';
import { CompositeSourceInspector } from '../../../src/infrastructure/adapters/composite.inspector.js';
import { assertDataDirIsolated } from '../../../src/infrastructure/adapters/data-file.js';
import { UrlSourceReader } from '../../../src/infrastructure/adapters/url.adapter.js';
import { UrlSourceInspector } from '../../../src/infrastructure/adapters/url.inspector.js';
import type { TextFetcher, TextRequestOptions, TextResponse } from '../../../src/infrastructure/http/http-client.js';

/** Serves bodies by exact address and records every request, headers included. No network. */
class FakeWeb implements TextFetcher {
  readonly requests: { url: string; headers: Record<string, string> }[] = [];

  constructor(private readonly pages: Record<string, { body: string; contentType: string | null }>) {}

  async getText(url: string, _sourceId: string, options: TextRequestOptions = {}): Promise<TextResponse> {
    this.requests.push({ url, headers: { ...(options.headers ?? {}) } });
    const page = this.pages[url];
    if (page === undefined) throw new SourceUnavailableError('fake', `${url} returned 404`);
    return { body: page.body, contentType: page.contentType, url };
  }
}

class MemorySecrets implements SecretStore {
  constructor(private readonly values: Record<string, string> = {}) {}

  async get(name: string): Promise<string | null> {
    return this.values[name] ?? null;
  }

  async names(): Promise<readonly string[]> {
    return Object.keys(this.values).sort();
  }

  async set(name: string, value: string): Promise<void> {
    this.values[name] = value;
  }

  async remove(name: string): Promise<void> {
    delete this.values[name];
  }
}

const FEED = 'https://news.example.com/world/rss.xml';
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Example World News</title>
  <link>https://news.example.com/</link>
  <item>
    <title>Rains flood the delta</title>
    <description>&lt;p&gt;Thousands moved to higher ground.&lt;/p&gt;</description>
    <link>https://news.example.com/a</link>
    <guid>news-a</guid>
    <pubDate>Sat, 13 Sep 2026 09:30:00 GMT</pubDate>
    <category>Asia</category>
  </item>
  <item>
    <title>Gold at a record</title>
    <description>Prices rose again.</description>
    <link>https://news.example.com/b</link>
    <guid>news-b</guid>
    <pubDate>Fri, 12 Sep 2026 08:00:00 GMT</pubDate>
    <category>Markets</category>
  </item>
</channel></rss>`;

const RELEASES = 'https://code.example.com/releases.atom';
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes</title>
  <updated>2026-09-12T10:00:00Z</updated>
  <entry>
    <id>tag:v2</id><updated>2026-09-11T18:00:00Z</updated>
    <link rel="alternate" href="https://code.example.com/v2"/>
    <title>Version 2</title><summary>Faster.</summary>
  </entry>
  <entry>
    <id>tag:v1</id><updated>2026-08-01T18:00:00Z</updated>
    <link rel="alternate" href="https://code.example.com/v1"/>
    <title>Version 1</title><summary>First.</summary>
  </entry>
</feed>`;

const API = 'https://api.example.com/v1/projects';
const JSON_BODY = JSON.stringify({
  meta: { total: 2 },
  data: {
    items: [
      {
        id: 101,
        name: 'Tea shop',
        description: 'Opening in October.',
        created_at: '2026-09-01T10:00:00Z',
        html_url: 'https://example.com/p/101',
      },
      {
        id: 102,
        name: 'Bakery',
        description: 'Needs a new oven.',
        created_at: '2026-09-05T10:00:00Z',
        html_url: 'https://example.com/p/102',
      },
    ],
  },
});

const SHEET = 'https://docs.example.com/sheet/export?format=csv';
const CSV = 'Date,Price\n2026-07,2410.5\n2026-08,2455.1\n2026-09,2501.9\n';

const HOME = 'https://news.example.com/';
const HTML = '<!DOCTYPE html><html><head><title>News</title></head><body><h1>Hello</h1></body></html>';

const web = (): FakeWeb =>
  new FakeWeb({
    [FEED]: { body: RSS, contentType: 'text/xml' },
    [RELEASES]: { body: ATOM, contentType: 'application/atom+xml' },
    [API]: { body: JSON_BODY, contentType: 'application/json' },
    // Published spreadsheets are often served as plain text; the body decides.
    [SHEET]: { body: CSV, contentType: 'text/plain; charset=utf-8' },
    [HOME]: { body: HTML, contentType: 'text/html' },
  });

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'stackvoice-sources-'));
  dataDir = join(root, 'data');
  await mkdir(join(dataDir, 'exports'), { recursive: true });
  await writeFile(join(dataDir, 'exports', 'prices.csv'), CSV, 'utf8');
  // Beside the data directory, standing in for config/secrets.yml.
  await writeFile(join(root, 'secrets.csv'), 'Name,Value\nTOKEN,hunter2\n', 'utf8');
});

const inspector = (fetcher: FakeWeb, secrets: SecretStore = new MemorySecrets()): UrlSourceInspector =>
  new UrlSourceInspector({ http: fetcher, secrets, dataDir });

describe('UrlSourceInspector', () => {
  it('reads an RSS feed as records with a title, summary, date and link', async () => {
    const proposal = await inspector(web()).inspect({ type: 'url', url: FEED });

    expect(proposal.location).toEqual({ type: 'url', url: FEED, format: 'rss', headers: {} });
    expect(proposal.suggestedLabel).toBe('Example World News');
    expect(proposal.itemsPath).toBe('items');
    expect(proposal.itemCount).toBe(2);
    expect(proposal.fields).toMatchObject({
      key: 'id',
      title: 'title',
      summary: 'summary',
      date: 'date',
      topic: 'category',
      url: 'link',
    });
    expect(proposal.suggestedPrimitives).toEqual({ search: true, read: true, status: true });
    expect(proposal.evidence.find((row) => row.field === 'summary')?.sample).toBe('Thousands moved to higher ground.');
  });

  it('tells an Atom feed from RSS by its body', async () => {
    const proposal = await inspector(web()).inspect({ type: 'url', url: RELEASES });

    expect(proposal.location).toMatchObject({ format: 'atom' });
    expect(proposal.suggestedLabel).toBe('Release notes');
    expect(proposal.evidence.find((row) => row.field === 'url')?.sample).toBe('https://code.example.com/v2');
  });

  it('finds the records nested inside a JSON API response', async () => {
    const proposal = await inspector(web()).inspect({ type: 'url', url: API });

    expect(proposal.location).toMatchObject({ format: 'json' });
    expect(proposal.itemsPath).toBe('data.items');
    expect(proposal.fields).toMatchObject({
      key: 'id',
      title: 'name',
      summary: 'description',
      date: 'created_at',
      url: 'html_url',
    });
    expect(proposal.suggestedLabel).toBeNull();
  });

  it('reads a spreadsheet served as plain text, combining columns into something to say', async () => {
    const proposal = await inspector(web()).inspect({ type: 'url', url: SHEET });

    expect(proposal.location).toMatchObject({ format: 'csv' });
    expect(proposal.fields.title).toBe('{Date}: {Price}');
    expect(proposal.fields.key).toBe('Date');
    expect(proposal.evidence.find((row) => row.field === 'title')?.sample).toBe('2026-07: 2410.5');
    // A date keys the rows, but nobody asks for a row back by its date.
    expect(proposal.suggestedPrimitives.read).toBe(false);
  });

  it('says a web page is not data, and what to paste instead', async () => {
    await expect(inspector(web()).inspect({ type: 'url', url: HOME })).rejects.toThrowError(/web page, not data/);
  });

  it('fills a secret into the request and keeps only the reference in the proposal', async () => {
    const fetcher = web();
    const headers = { Authorization: 'Bearer {{secret:EXAMPLE_KEY}}' };

    const proposal = await inspector(fetcher, new MemorySecrets({ EXAMPLE_KEY: 'sk-live-123' })).inspect({
      type: 'url',
      url: API,
      headers,
    });

    expect(fetcher.requests[0]?.headers).toEqual({ Authorization: 'Bearer sk-live-123' });
    expect(proposal.location).toMatchObject({ headers });
    expect(JSON.stringify(proposal)).not.toContain('sk-live-123');
  });

  it('names a missing secret without making a request', async () => {
    const fetcher = web();

    await expect(
      inspector(fetcher).inspect({
        type: 'url',
        url: API,
        headers: { Authorization: 'Bearer {{secret:MISSING_KEY}}' },
      }),
    ).rejects.toThrowError(/MISSING_KEY/);
    expect(fetcher.requests).toEqual([]);
  });

  it('reads a file from the data directory', async () => {
    const proposal = await inspector(web()).inspect({ type: 'file', path: 'exports/prices.csv' });

    expect(proposal.location).toEqual({ type: 'file', path: 'exports/prices.csv', format: 'csv' });
    expect(proposal.itemCount).toBe(3);
  });

  it('says when a file is not there', async () => {
    await expect(inspector(web()).inspect({ type: 'file', path: 'nope.csv' })).rejects.toThrowError(
      /no file at nope\.csv/,
    );
  });

  it('refuses a path that climbs out of the data directory', async () => {
    await expect(inspector(web()).inspect({ type: 'file', path: '../secrets.csv' })).rejects.toThrowError(
      /outside the data directory/,
    );
  });

  it('refuses a link inside the data directory that points out of it', async () => {
    // A junction needs no special rights on Windows; elsewhere it is an ordinary directory link.
    await symlink(root, join(dataDir, 'escape'), 'junction');

    await expect(inspector(web()).inspect({ type: 'file', path: 'escape/secrets.csv' })).rejects.toThrowError(
      /outside the data directory/,
    );
  });
});

const source = (
  location: SourceLocation,
  over: { fields?: Partial<FieldMap>; itemsPath?: string | null } = {},
): DataSource =>
  new DataSource({
    id: 'news',
    label: 'news',
    itemsPath: over.itemsPath === undefined ? 'items' : over.itemsPath,
    fields: {
      key: 'id',
      title: 'title',
      summary: 'summary',
      date: 'date',
      topic: 'category',
      region: null,
      url: 'link',
      ...over.fields,
    },
    statusFields: DEFAULT_STATUS_FIELD_MAP,
    ...location,
  });

describe('UrlSourceReader', () => {
  const reader = (fetcher: FakeWeb, secrets: SecretStore = new MemorySecrets()): UrlSourceReader =>
    new UrlSourceReader({ http: fetcher, secrets, dataDir });
  const feed = (headers: Record<string, string> = {}): DataSource =>
    source({ type: 'url', url: FEED, format: 'rss', headers });

  it('searches a feed and returns items with sortable dates', async () => {
    const items = await reader(web()).search(feed(), { query: 'gold', limit: 5 });

    expect(items.map((item) => item.title)).toEqual(['Gold at a record']);
    expect(items[0]?.date).toBe('2026-09-12T08:00:00.000Z');
    expect(items[0]?.url).toBe('https://news.example.com/b');
  });

  it('reads one entry back by its key', async () => {
    const item = await reader(web()).read(feed(), 'news-a');

    expect(item?.title).toBe('Rains flood the delta');
  });

  it('reports health from the records themselves', async () => {
    const health = await reader(web()).status(feed());

    expect(health).toMatchObject({
      sourceId: 'news',
      ok: true,
      itemCount: 2,
      lastDataDate: '2026-09-13T09:30:00.000Z',
      lastError: null,
    });
  });

  it('reports an unreachable source as unhealthy instead of throwing', async () => {
    const health = await reader(new FakeWeb({})).status(feed());

    expect(health.ok).toBe(false);
    expect(health.lastError).toMatch(/404/);
  });

  it('sends the secret the source references', async () => {
    const fetcher = web();

    await reader(fetcher, new MemorySecrets({ NEWS_KEY: 'abc' })).search(feed({ 'X-Api-Key': '{{secret:NEWS_KEY}}' }), {
      limit: 1,
    });

    expect(fetcher.requests[0]?.headers).toEqual({ 'X-Api-Key': 'abc' });
  });

  it('reads a CSV file through a template title', async () => {
    const prices = source(
      { type: 'file', path: 'exports/prices.csv', format: 'csv' },
      {
        itemsPath: null,
        fields: { key: 'Date', title: '{Date}: {Price}', summary: null, date: 'Date', topic: null, url: null },
      },
    );

    const items = await reader(web()).search(prices, { limit: 10 });

    expect(items.map((item) => item.title)).toContain('2026-09: 2501.9');
    expect((await reader(web()).status(prices)).lastDataDate).toBe('2026-09');
  });

  it('explains a list that is not where the source says it is', async () => {
    const projects = source({ type: 'url', url: API, format: 'json', headers: {} }, { itemsPath: 'results' });

    await expect(reader(web()).search(projects, { limit: 5 })).rejects.toThrowError(/no list of records at "results"/);
  });

  it('leaves GitHub sources to their own adapter', async () => {
    const github = new DataSource({
      id: 'hub',
      label: 'hub',
      itemsPath: null,
      fields: DEFAULT_FIELD_MAP,
      statusFields: DEFAULT_STATUS_FIELD_MAP,
      type: 'github-repo',
      repo: 'owner/name',
      viewsDir: 'data/views',
      indexFile: 'data/views/index.json',
      statsFile: 'data/views/stats.json',
    });

    await expect(reader(web()).search(github, { limit: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('CompositeSourceInspector', () => {
  it('sends a repository to the GitHub inspector and everything else to the generic one', async () => {
    const calls: string[] = [];
    const fake = (name: string): SourceInspector => ({
      inspect: async (target: SourceTarget) => {
        calls.push(`${name}:${target.type}`);
        return {} as SourceProposal;
      },
    });
    const composite = new CompositeSourceInspector(fake('github'), fake('generic'));

    await composite.inspect({ type: 'github-repo', repo: 'owner/name' });
    await composite.inspect({ type: 'url', url: FEED });
    await composite.inspect({ type: 'file', path: 'a.csv' });

    expect(calls).toEqual(['github:github-repo', 'generic:url', 'generic:file']);
  });
});

describe('assertDataDirIsolated', () => {
  it('accepts a folder beside config', () => {
    expect(() => assertDataDirIsolated(join(root, 'data'), join(root, 'config'))).not.toThrow();
  });

  it('refuses the folder that holds config', () => {
    expect(() => assertDataDirIsolated(root, join(root, 'config'))).toThrowError(/overlaps the config directory/);
  });

  it('refuses config itself, and anything inside it', () => {
    expect(() => assertDataDirIsolated(join(root, 'config'), join(root, 'config'))).toThrowError(/overlaps/);
    expect(() => assertDataDirIsolated(join(root, 'config', 'data'), join(root, 'config'))).toThrowError(/overlaps/);
  });
});
