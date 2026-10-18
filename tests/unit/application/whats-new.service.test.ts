import { describe, expect, it } from 'vitest';

import type { AppRegistryService } from '../../../src/application/app-registry.service.js';
import type { SearchService } from '../../../src/application/search.service.js';
import { WhatsNewService } from '../../../src/application/whats-new.service.js';
import type { AppDefinition } from '../../../src/domain/app-definition.js';
import { AppNotFoundError, SourceUnavailableError } from '../../../src/domain/errors.js';
import type { Item } from '../../../src/domain/item.js';
import type { SeenMark, SeenStore } from '../../../src/domain/ports/seen-store.js';

const item = (key: string, date: string | null): Item => ({
  key,
  title: `Title ${key}`,
  summary: null,
  date,
  topic: null,
  region: null,
  url: null,
});

/** Apps by id, each with the entries its source holds, newest first as the readers return them. */
function harness(data: Record<string, readonly Item[] | Error>, record = true) {
  const apps = Object.keys(data).map((id) => ({ id, label: `My ${id}` }) as AppDefinition);
  const registry = {
    listEnabled: () => apps,
    get: (id: string) => {
      const app = apps.find((candidate) => candidate.id === id);
      if (app === undefined) throw new AppNotFoundError(id);
      return app;
    },
  } as unknown as AppRegistryService;
  const search = {
    search: async (id: string, params: { limit: number }) => {
      const found = data[id];
      if (found instanceof Error) throw found;
      return (found ?? []).slice(0, params.limit);
    },
  } as unknown as SearchService;

  let marks: Record<string, SeenMark> = {};
  let saves = 0;
  const store: SeenStore = {
    load: async () => marks,
    save: async (next) => {
      saves += 1;
      marks = { ...next };
    },
  };

  let clock = new Date('2026-10-18T10:00:00Z');
  const service = new WhatsNewService({ registry, search, store, now: () => clock, record });
  return {
    service,
    data,
    marks: () => marks,
    saves: () => saves,
    later: (iso: string) => {
      clock = new Date(iso);
    },
  };
}

describe('WhatsNewService', () => {
  it('starts tracking an app the first time, with its newest entry', async () => {
    const h = harness({ ideas: [item('b', '2026-10-16'), item('a', '2026-10-13')] });

    const report = await h.service.report('ideas');

    expect(report.apps[0]).toMatchObject({ kind: 'first', newest: { key: 'b' } });
    expect(h.marks()['ideas']).toEqual({ seenUntil: '2026-10-16', askedAt: '2026-10-18T10:00:00.000Z' });
  });

  it('counts only the entries dated after the last one reported, newest first', async () => {
    const h = harness({ ideas: [item('b', '2026-10-16'), item('a', '2026-10-13')] });
    await h.service.report('ideas');
    (h.data['ideas'] as Item[]).unshift(item('d', '2026-10-18'), item('c', '2026-10-17'));
    h.later('2026-10-19T08:00:00Z');

    const report = await h.service.report('ideas');

    expect(report.apps[0]).toMatchObject({ kind: 'new', atLeast: false, since: '2026-10-18T10:00:00.000Z' });
    const entry = report.apps[0] as { items: Item[] };
    expect(entry.items.map((found) => found.key)).toEqual(['d', 'c']);
    expect(h.marks()['ideas']).toEqual({ seenUntil: '2026-10-18', askedAt: '2026-10-19T08:00:00.000Z' });
  });

  it('remembers between reports, so asking twice gives nothing new the second time', async () => {
    const h = harness({ ideas: [item('b', '2026-10-16')] });
    await h.service.report('ideas');

    const report = await h.service.report('ideas');

    expect(report.apps[0]).toMatchObject({ kind: 'none', since: '2026-10-18T10:00:00.000Z' });
  });

  it('says there may be more when every entry it looked at was new', async () => {
    const h = harness({ feed: [item('old', '2026-01-01')] });
    await h.service.report('feed');
    h.data['feed'] = Array.from({ length: 12 }, (_, i) => item(`n${i}`, `2026-10-${String(30 - i)}`));

    const report = await h.service.report('feed');

    expect(report.apps[0]).toMatchObject({ kind: 'new', atLeast: true });
    expect((report.apps[0] as { items: Item[] }).items).toHaveLength(10);
  });

  it('cannot call anything new in an app without dates, and does not track it', async () => {
    const h = harness({ notes: [item('a', null)] });

    const report = await h.service.report('notes');

    expect(report.apps[0]?.kind).toBe('undated');
    expect(h.marks()).toEqual({});
  });

  it('reports every enabled app when none is named, and one unreachable app does not hide the others', async () => {
    const h = harness({
      ideas: [item('a', '2026-10-16')],
      feed: new SourceUnavailableError('feed', 'the feed timed out'),
    });

    const report = await h.service.report();

    expect(report.appId).toBeNull();
    expect(report.apps.map((entry) => [entry.appId, entry.kind])).toEqual([
      ['ideas', 'first'],
      ['feed', 'unavailable'],
    ]);
    expect(Object.keys(h.marks())).toEqual(['ideas']);
  });

  it('peeks without marking anything as told when asked not to record', async () => {
    const h = harness({ ideas: [item('a', '2026-10-16')] }, false);

    await h.service.report('ideas');
    const again = await h.service.report('ideas');

    expect(again.apps[0]?.kind).toBe('first');
    expect(h.saves()).toBe(0);
  });

  it('refuses an app it does not know', async () => {
    const h = harness({ ideas: [] });

    await expect(h.service.report('nope')).rejects.toBeInstanceOf(AppNotFoundError);
  });
});
