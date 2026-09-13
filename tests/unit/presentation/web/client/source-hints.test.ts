import { describe, expect, it } from 'vitest';

import {
  addColumn,
  describeLocation,
  keyHeaderValue,
  kindOf,
  looksLikeLink,
  looksLikeRepo,
  nameFrom,
  secretNameFor,
  toAppId,
} from '../../../../../src/presentation/web/client/apps/source-hints.js';

describe('looksLikeRepo', () => {
  it.each([
    'owner/name',
    'SatPaingOo/information-hub',
    'https://github.com/owner/name',
    'https://github.com/owner/name/tree/gh-pages',
  ])('treats %s as a repository', (input) => {
    expect(looksLikeRepo(input)).toBe(true);
  });

  it.each(['exports/prices.csv', 'reports/latest.json', 'https://example.com/owner/name', 'prices.csv', ''])(
    'does not treat %s as a repository',
    (input) => {
      expect(looksLikeRepo(input)).toBe(false);
    },
  );
});

describe('looksLikeLink', () => {
  it('is true for an address that is not on GitHub', () => {
    expect(looksLikeLink('https://feeds.bbci.co.uk/news/rss.xml')).toBe(true);
  });

  it('is false for a GitHub repository link, which needs a branch rather than a key', () => {
    expect(looksLikeLink('https://github.com/owner/name')).toBe(false);
  });

  it('is false for a file name', () => {
    expect(looksLikeLink('prices.csv')).toBe(false);
  });
});

describe('nameFrom', () => {
  it('uses the repository name', () => {
    expect(nameFrom('SatPaingOo/information-hub')).toBe('information hub');
  });

  it('uses the host of a link', () => {
    expect(nameFrom('https://www.example.com/feed.xml')).toBe('example.com');
  });

  it('uses a file name without its extension', () => {
    expect(nameFrom('exports/gold_prices.csv')).toBe('gold prices');
  });
});

describe('toAppId', () => {
  it('makes an id the server accepts', () => {
    expect(toAppId('BBC News - World')).toBe('bbc-news-world');
  });

  it('starts with a letter even when the name does not', () => {
    expect(toAppId('2026 prices')).toBe('app-2026-prices');
  });

  it('never returns something too short to be an id', () => {
    expect(toAppId('!')).toBe('app');
    expect(toAppId('')).toBe('app');
  });

  it('stays within 32 characters without a trailing dash', () => {
    const id = toAppId('a very long name that keeps going well past the limit');
    expect(id.length).toBeLessThanOrEqual(32);
    expect(id.endsWith('-')).toBe(false);
  });
});

describe('secretNameFor', () => {
  it('names a key after the host it is for', () => {
    expect(secretNameFor('https://api.example.com/v1/items')).toBe('EXAMPLE_KEY');
  });

  it('falls back to a generic name when the address cannot be read', () => {
    expect(secretNameFor('not a link')).toBe('API_KEY');
  });
});

describe('keyHeaderValue', () => {
  it('references the key, with the scheme in front', () => {
    expect(keyHeaderValue('Bearer', 'EXAMPLE_KEY')).toBe('Bearer {{secret:EXAMPLE_KEY}}');
  });

  it('leaves out an empty scheme', () => {
    expect(keyHeaderValue('  ', 'EXAMPLE_KEY')).toBe('{{secret:EXAMPLE_KEY}}');
  });
});

describe('kindOf and describeLocation', () => {
  it('names each kind of source', () => {
    expect(kindOf({ type: 'github-repo' })).toBe('GitHub');
    expect(kindOf({ type: 'url', format: 'rss' })).toBe('RSS feed');
    expect(kindOf({ type: 'file', format: 'csv' })).toBe('File · CSV');
  });

  it('describes a link by host and path', () => {
    expect(
      describeLocation({ type: 'url', url: 'https://api.example.com/v1/items', format: 'json', headers: [] }),
    ).toBe('api.example.com/v1/items');
  });
});

describe('addColumn', () => {
  it('fills an empty field with the column', () => {
    expect(addColumn('', 'Date')).toBe('Date');
  });

  it('turns a single path into a template', () => {
    expect(addColumn('Date', 'Price')).toBe('{Date} {Price}');
  });

  it('appends to a template', () => {
    expect(addColumn('{Date}: {Price}', 'Unit')).toBe('{Date}: {Price} {Unit}');
  });
});
