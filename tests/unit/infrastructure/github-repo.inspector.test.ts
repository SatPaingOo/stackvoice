import { describe, expect, it } from 'vitest';

import { SourceUnavailableError } from '../../../src/domain/errors.js';
import { GithubRepoInspector } from '../../../src/infrastructure/adapters/github-repo.inspector.js';
import type { JsonFetcher } from '../../../src/infrastructure/http/http-client.js';

/** Serves only the paths the test defines; everything else 404s, like a real repo. */
class FakeRepo implements JsonFetcher {
  constructor(private readonly files: Record<string, unknown>) {}

  async getJson<T>(url: string): Promise<T> {
    const path = url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '');
    if (path in this.files) return this.files[path] as T;
    throw new SourceUnavailableError('fake', `${path} not found`);
  }
}

const article = (n: number) => ({
  key: `2026-09-0${n}-001`,
  title: `Article ${n}`,
  tldr: `What article ${n} says.`,
  date: `2026-09-0${n}`,
  topic: 'world',
  region: 'global',
  source_url: `https://example.com/${n}`,
});

describe('GithubRepoInspector.inspect', () => {
  it('maps a flat array of articles onto the normalized fields', async () => {
    const repo = new FakeRepo({
      'data/views/index.json': [article(1), article(2), article(3)],
      'data/views/stats.json': { last_date: '2026-09-03', total_items: 3 },
    });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.itemsPath).toBeNull();
    expect(proposal.itemCount).toBe(3);
    expect(proposal.fields).toEqual({
      key: 'key',
      title: 'title',
      summary: 'tldr',
      date: 'date',
      topic: 'topic',
      region: 'region',
      url: 'source_url',
    });
    expect(proposal.statusFields).toEqual({ lastDataDate: 'last_date', itemCount: 'total_items' });
  });

  it('finds records nested under a key', async () => {
    const repo = new FakeRepo({
      'data/views/index.json': { updated_at: '2026-09-12', recent_events: [article(1), article(2)] },
    });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.itemsPath).toBe('recent_events');
    expect(proposal.itemCount).toBe(2);
  });

  it('prefers readable records over a longer list of unreadable ones', async () => {
    const prices = Array.from({ length: 40 }, (_, i) => ({ asset: `A${i}`, last_close: i, region: 'global' }));
    const repo = new FakeRepo({
      'data/views/index.json': { prices, recent_events: [article(1), article(2)] },
    });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.itemsPath).toBe('recent_events');
  });

  it('picks the stats document that can answer both questions', async () => {
    const repo = new FakeRepo({
      'data/views/index.json': { recent_events: [article(1)], updated_at: '2026-09-12', stats: { events: 2894 } },
      // Exists and has a date, but no count — the index document is the better source.
      'data/views/status.json': { updated_at: '2026-09-12', healthy: true },
    });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.statsFile).toBe('data/views/index.json');
    expect(proposal.statusFields).toEqual({ lastDataDate: 'updated_at', itemCount: 'stats.events' });
  });

  it('never names a field that is not in the data', async () => {
    const bare = [
      { id: 'a', headline: 'One' },
      { id: 'b', headline: 'Two' },
    ];
    const repo = new FakeRepo({ 'data/views/index.json': bare });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.fields.title).toBe('headline');
    expect(proposal.fields.summary).toBeNull();
    expect(proposal.fields.date).toBeNull();
    expect(proposal.fields.url).toBeNull();
  });

  it('turns off the read verb when records carry no identifier', async () => {
    const repo = new FakeRepo({
      'data/views/index.json': [{ title: 'One' }, { title: 'Two' }],
    });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.suggestedPrimitives).toEqual({ search: true, read: false, status: true });
  });

  it('ignores a field that is present but empty on most records', async () => {
    const mostlyEmpty = [
      { key: 'a', title: 'One', summary: '' },
      { key: 'b', title: 'Two', summary: '  ' },
      { key: 'c', title: 'Three', summary: 'only this one' },
    ];
    const repo = new FakeRepo({ 'data/views/index.json': mostlyEmpty });

    const proposal = await new GithubRepoInspector(repo).inspect('owner/name');

    expect(proposal.fields.summary).toBeNull();
  });

  it('refuses a source whose records have nothing to say', async () => {
    const repo = new FakeRepo({
      'data/views/index.json': [{ asset: 'GOLD', last_close: 2400 }],
    });

    await expect(new GithubRepoInspector(repo).inspect('owner/name')).rejects.toThrowError(
      /none of them carry a title or summary/,
    );
  });

  it('says what it looked for when a repo has no read model', async () => {
    const repo = new FakeRepo({});

    await expect(new GithubRepoInspector(repo).inspect('owner/name')).rejects.toThrowError(
      /no read model found/,
    );
  });

  it('reads a non-default branch', async () => {
    const repo = new FakeRepo({ 'data/views/index.json': [article(1)] });
    const seen: string[] = [];
    const spy: JsonFetcher = {
      getJson: async <T>(url: string, id: string): Promise<T> => {
        seen.push(url);
        return repo.getJson<T>(url, id);
      },
    };

    await new GithubRepoInspector(spy).inspect('owner/name', 'gh-pages');

    expect(seen[0]).toContain('/owner/name/gh-pages/');
  });
});
