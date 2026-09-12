import { describe, expect, it } from 'vitest';

import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
  type FieldMap,
  type StatusFieldMap,
} from '../../../src/domain/data-source.js';
import { SourceUnavailableError } from '../../../src/domain/errors.js';
import { GithubRepoAdapter } from '../../../src/infrastructure/adapters/github-repo.adapter.js';
import type { JsonFetcher } from '../../../src/infrastructure/http/http-client.js';

/** Serves fixtures by URL substring; no network, no live data. */
class FakeFetcher implements JsonFetcher {
  readonly requested: string[] = [];

  constructor(private readonly routes: Record<string, unknown>) {}

  async getJson<T>(url: string): Promise<T> {
    this.requested.push(url);
    for (const [fragment, body] of Object.entries(this.routes)) {
      if (url.includes(fragment)) {
        if (body instanceof Error) throw body;
        return body as T;
      }
    }
    throw new SourceUnavailableError('fake', `no fixture for ${url}`);
  }
}

const makeSource = (over: { fields?: FieldMap; statusFields?: StatusFieldMap; itemsPath?: string | null } = {}) =>
  new DataSource({
    id: 'library',
    type: 'github-repo',
    label: 'deep-dive library',
    repo: 'owner/repo',
    viewsDir: 'data/views',
    statsFile: 'data/views/stats.json',
    indexFile: 'data/views/index.json',
    itemsPath: over.itemsPath ?? null,
    fields: over.fields ?? DEFAULT_FIELD_MAP,
    statusFields: over.statusFields ?? DEFAULT_STATUS_FIELD_MAP,
  });

const flatItems = [
  { key: 'a', title: 'Gold rises', summary: 'metals', date: '2026-09-01', topic: 't', region: 'r', url: 'u' },
  { key: 'b', title: 'Silver falls', summary: 'metals', date: '2026-09-02', topic: 't', region: 'r', url: 'u' },
];

describe('GithubRepoAdapter.search', () => {
  it('fetches the index from raw.githubusercontent and ranks the results', async () => {
    const fetcher = new FakeFetcher({ 'index.json': flatItems });

    const items = await new GithubRepoAdapter(fetcher).search(makeSource(), { query: 'gold', limit: 5 });

    expect(items.map((i) => i.key)).toEqual(['a']);
    expect(fetcher.requested[0]).toBe('https://raw.githubusercontent.com/owner/repo/main/data/views/index.json');
  });

  it('honours the limit', async () => {
    const fetcher = new FakeFetcher({ 'index.json': flatItems });

    const items = await new GithubRepoAdapter(fetcher).search(makeSource(), { limit: 1 });

    expect(items).toHaveLength(1);
  });

  it('reads items nested under items_path', async () => {
    const fetcher = new FakeFetcher({ 'index.json': { recent_events: flatItems, stats: { events: 9 } } });

    const items = await new GithubRepoAdapter(fetcher).search(makeSource({ itemsPath: 'recent_events' }), {
      limit: 5,
    });

    expect(items).toHaveLength(2);
  });

  it('maps payload field names through the field map', async () => {
    const fetcher = new FakeFetcher({
      'index.json': [{ id: 'evt-1', headline: 'Oil moves', blurb: 'why', when: '2026-09-03' }],
    });
    const fields: FieldMap = {
      key: 'id',
      title: 'headline',
      summary: 'blurb',
      date: 'when',
      topic: null,
      region: null,
      url: null,
    };

    const items = await new GithubRepoAdapter(fetcher).search(makeSource({ fields }), { limit: 5 });

    expect(items[0]).toEqual({
      key: 'evt-1',
      title: 'Oil moves',
      summary: 'why',
      date: '2026-09-03',
      topic: null,
      region: null,
      url: null,
    });
  });

  it('skips entries with no key or no title rather than inventing them', async () => {
    const fetcher = new FakeFetcher({ 'index.json': [{ key: 'a' }, { title: 'no key' }, ...flatItems] });

    const items = await new GithubRepoAdapter(fetcher).search(makeSource(), { limit: 10 });

    expect(items.map((i) => i.key)).toEqual(['b', 'a']);
  });

  it('fails with a typed error when the document is not a list', async () => {
    const fetcher = new FakeFetcher({ 'index.json': { not: 'a list' } });

    await expect(new GithubRepoAdapter(fetcher).search(makeSource(), { limit: 5 })).rejects.toBeInstanceOf(
      SourceUnavailableError,
    );
  });
});

describe('GithubRepoAdapter.read', () => {
  it('finds an entry by key, ignoring case', async () => {
    const fetcher = new FakeFetcher({ 'index.json': flatItems });

    const item = await new GithubRepoAdapter(fetcher).read(makeSource(), ' A ');

    expect(item?.title).toBe('Gold rises');
  });

  it('resolves to null for an unknown key', async () => {
    const fetcher = new FakeFetcher({ 'index.json': flatItems });

    expect(await new GithubRepoAdapter(fetcher).read(makeSource(), 'zzz')).toBeNull();
  });
});

describe('GithubRepoAdapter.status', () => {
  const run = { conclusion: 'success', updated_at: '2026-09-12T13:47:51Z' };

  it('combines the stats document with the latest Actions run', async () => {
    const fetcher = new FakeFetcher({
      'stats.json': { last_date: '2026-09-12', total_items: 177 },
      'actions/runs': { workflow_runs: [run] },
    });

    const health = await new GithubRepoAdapter(fetcher).status(makeSource());

    expect(health.ok).toBe(true);
    expect(health.itemCount).toBe(177);
    expect(health.lastDataDate).toBe('2026-09-12');
    expect(health.lastRunAt).toBe('2026-09-12T13:47:51Z');
    expect(health.lastError).toBeNull();
  });

  it('reads counts from a dot path', async () => {
    const fetcher = new FakeFetcher({
      'stats.json': { updated_at: '2026-09-12T14:43:08Z', stats: { events: 2894 } },
      'actions/runs': { workflow_runs: [run] },
    });
    const statusFields: StatusFieldMap = { lastDataDate: 'updated_at', itemCount: 'stats.events' };

    const health = await new GithubRepoAdapter(fetcher).status(makeSource({ statusFields }));

    expect(health.itemCount).toBe(2894);
  });

  it('reports a failed run as unhealthy instead of throwing', async () => {
    const fetcher = new FakeFetcher({
      'stats.json': { last_date: '2026-09-12', total_items: 1 },
      'actions/runs': { workflow_runs: [{ conclusion: 'failure', updated_at: '2026-09-12T13:00:00Z' }] },
    });

    const health = await new GithubRepoAdapter(fetcher).status(makeSource());

    expect(health.ok).toBe(false);
    expect(health.lastError).toBe('last run failure');
  });

  it('degrades to an unhealthy report when the source is unreachable, so the server stays up', async () => {
    const fetcher = new FakeFetcher({ 'stats.json': new SourceUnavailableError('library', 'network down') });

    const health = await new GithubRepoAdapter(fetcher).status(makeSource());

    expect(health.ok).toBe(false);
    expect(health.lastError).toContain('network down');
    expect(health.itemCount).toBeNull();
  });
});
