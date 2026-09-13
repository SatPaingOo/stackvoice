import { describe, expect, it } from 'vitest';

import { DEFAULT_FIELD_MAP, type FieldMap } from '../../../src/domain/data-source.js';
import type { Item } from '../../../src/domain/item.js';
import {
  buildEvidence,
  fallbackTitle,
  inferFields,
  locateItems,
  newestDate,
  normalizeDate,
  resolveField,
  toItem,
} from '../../../src/infrastructure/adapters/records.js';

const feedItem = (n: number) => ({
  id: `https://example.org/${n}`,
  title: `Story ${n}`,
  summary: `What story ${n} says.`,
  date: `2026-09-1${n}T09:00:00.000Z`,
  link: `https://example.org/${n}`,
  category: 'World',
  author: null,
});

describe('locateItems', () => {
  it('uses the document itself when it is a list of records', () => {
    const found = locateItems([feedItem(1), feedItem(2)]);
    expect(found?.path).toBeNull();
    expect(found?.items).toHaveLength(2);
  });

  it('finds a list nested a couple of levels down, and reports its dot path', () => {
    const found = locateItems({ meta: { total: 2 }, data: { items: [feedItem(1), feedItem(2)] } });
    expect(found?.path).toBe('data.items');
  });

  it('prefers the readable list over a longer one', () => {
    const prices = Array.from({ length: 40 }, (_, i) => ({ asset: `A${i}`, last_close: i }));
    const found = locateItems({ prices, events: [feedItem(1)] });
    expect(found?.path).toBe('events');
  });

  it('ignores lists of plain values', () => {
    expect(locateItems({ ids: [1, 2, 3] })).toBeNull();
  });

  it('does not dig past a few levels', () => {
    expect(locateItems({ a: { b: { c: { d: [feedItem(1)] } } } })).toBeNull();
  });
});

describe('inferFields', () => {
  it('maps a flattened feed record', () => {
    expect(inferFields([feedItem(1), feedItem(2)])).toEqual({
      key: 'id',
      title: 'title',
      summary: 'summary',
      date: 'date',
      topic: 'category',
      region: null,
      url: 'link',
    });
  });

  it('matches CSV headers whatever their case', () => {
    const rows = [
      { Date: '1833-01', Price: '18.930' },
      { Date: '1833-02', Price: '19.100' },
    ];
    expect(inferFields(rows)).toMatchObject({ date: 'Date', title: null, key: null });
  });

  it('reads a capitalized Name column as the title', () => {
    expect(inferFields([{ Name: 'Afghanistan', Code: 'AF' }]).title).toBe('Name');
  });

  it('ignores a field that is empty on most records', () => {
    const rows = [
      { title: 'a', summary: '' },
      { title: 'b', summary: ' ' },
      { title: 'c', summary: 'only one' },
    ];
    expect(inferFields(rows).summary).toBeNull();
  });
});

describe('fallbackTitle', () => {
  it('joins the first two text columns for rows that have no title', () => {
    expect(fallbackTitle([{ Date: '1833-01', Price: '18.930' }])).toBe('{Date}: {Price}');
  });

  it('uses a single column on its own', () => {
    expect(fallbackTitle([{ Reading: '21.5' }])).toBe('Reading');
  });

  it('gives up when nothing holds text', () => {
    expect(fallbackTitle([{ tags: ['a'] }])).toBeNull();
  });
});

describe('resolveField', () => {
  const row = { Date: '1833-01', Price: '18.930', nested: { name: 'Ada' } };

  it('reads a dot path', () => {
    expect(resolveField(row, 'nested.name')).toBe('Ada');
  });

  it('renders a template', () => {
    expect(resolveField(row, '{Date}: {Price}')).toBe('1833-01: 18.930');
  });

  it('drops the separator next to a missing part', () => {
    expect(resolveField({ Date: '1833-01' }, '{Date}: {Price}')).toBe('1833-01');
  });

  it('is null when every part of a template is missing', () => {
    expect(resolveField({}, '{Date}: {Price}')).toBeNull();
  });

  it('is null for an unmapped field', () => {
    expect(resolveField(row, null)).toBeNull();
  });
});

describe('toItem', () => {
  const fields: FieldMap = { ...DEFAULT_FIELD_MAP, key: 'Date', title: '{Date}: {Price}', summary: null, date: 'Date' };

  it('reads a CSV row through a template title', () => {
    expect(toItem({ Date: '1833-01', Price: '18.930' }, fields)).toMatchObject({
      key: '1833-01',
      title: '1833-01: 18.930',
      date: '1833-01',
    });
  });

  it('skips a record with no key rather than inventing one', () => {
    expect(toItem({ Price: '18.930' }, { ...fields, title: 'Price' })).toBeNull();
  });
});

describe('normalizeDate and newestDate', () => {
  it('keeps dates that already sort', () => {
    expect(normalizeDate('2026-09-13')).toBe('2026-09-13');
    expect(normalizeDate('1833-01')).toBe('1833-01');
  });

  it('turns a readable date into ISO', () => {
    expect(normalizeDate('Sat, 13 Sep 2026 09:30:00 GMT')).toBe('2026-09-13T09:30:00.000Z');
  });

  it('leaves anything else alone', () => {
    expect(normalizeDate('last Tuesday')).toBe('last Tuesday');
  });

  it('finds the newest date and ignores undated items', () => {
    const items = [{ date: '2026-09-11' }, { date: null }, { date: '2026-09-13' }] as unknown as Item[];
    expect(newestDate(items)).toBe('2026-09-13');
  });
});

describe('buildEvidence', () => {
  it('pairs each guess with a sample from the first record', () => {
    const evidence = buildEvidence(
      { ...DEFAULT_FIELD_MAP, title: '{Date}: {Price}' },
      { Date: '1833-01', Price: '18.930' },
    );
    expect(evidence.find((row) => row.field === 'title')).toEqual({
      field: 'title',
      path: '{Date}: {Price}',
      sample: '1833-01: 18.930',
    });
  });
});
