import { describe, expect, it } from 'vitest';

import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
  type DataSourceProps,
} from '../../../src/domain/data-source.js';
import { ValidationError } from '../../../src/domain/errors.js';

const common = {
  id: 'news',
  label: 'news',
  itemsPath: null,
  fields: DEFAULT_FIELD_MAP,
  statusFields: DEFAULT_STATUS_FIELD_MAP,
};

const github = (over: Partial<Extract<DataSourceProps, { type: 'github-repo' }>> = {}): DataSource =>
  new DataSource({
    ...common,
    type: 'github-repo',
    repo: 'owner/name',
    viewsDir: 'data/views',
    indexFile: 'data/views/index.json',
    statsFile: 'data/views/stats.json',
    ...over,
  });

const url = (address: string, headers: Record<string, string> = {}): DataSource =>
  new DataSource({ ...common, type: 'url', url: address, format: 'rss', headers });

const file = (path: string): DataSource => new DataSource({ ...common, type: 'file', path, format: 'csv' });

describe('github-repo sources', () => {
  it('default to the main branch', () => {
    const source = github();
    expect(source.location).toMatchObject({ type: 'github-repo', branch: 'main' });
  });

  it('describe themselves by repository', () => {
    expect(github().describe()).toBe('owner/name');
  });

  it('refuse a branch name with spaces', () => {
    expect(() => github({ branch: 'my branch' })).toThrowError(ValidationError);
  });
});

describe('url sources', () => {
  it('accept an https address and describe it by host and path', () => {
    const source = url('https://feeds.bbci.co.uk/news/rss.xml');
    expect(source.type).toBe('url');
    expect(source.describe()).toBe('feeds.bbci.co.uk/news/rss.xml');
  });

  it('describe a bare host without a trailing slash', () => {
    expect(url('https://example.org').describe()).toBe('example.org');
  });

  it.each(['ftp://example.org/data.csv', 'file:///etc/passwd', 'not a url'])('refuse %s', (address) => {
    expect(() => url(address)).toThrowError(ValidationError);
  });

  it('refuse credentials in the address, and say where they belong', () => {
    expect(() => url('https://me:secret@api.example.org/items')).toThrowError(/header/);
  });

  it('accept a header that references a secret, and name the secret', () => {
    const source = url('https://api.notion.com/v1/pages', {
      Authorization: 'Bearer {{secret:NOTION_TOKEN}}',
      'Notion-Version': '2022-06-28',
    });
    expect(source.secretNames()).toEqual(['NOTION_TOKEN']);
  });

  it('refuse a secret name that is not upper case', () => {
    expect(() => url('https://api.example.org/', { Authorization: 'Bearer {{secret:lower}}' })).toThrowError(
      /secret name/,
    );
  });

  it.each(['Bad Header', 'Host', 'cookie', 'Content-Length'])('refuse the header %s', (name) => {
    expect(() => url('https://api.example.org/', { [name]: 'x' })).toThrowError(ValidationError);
  });

  it('refuse a format it cannot read', () => {
    expect(
      () =>
        new DataSource({
          ...common,
          type: 'url',
          url: 'https://example.org/a.xml',
          format: 'xml' as never,
          headers: {},
        }),
    ).toThrowError(/json, rss, atom or csv/);
  });

  it('have no secrets when no header references one', () => {
    expect(url('https://example.org/feed').secretNames()).toEqual([]);
  });
});

describe('file sources', () => {
  it('accept a path inside the data directory', () => {
    expect(file('exports/notes.csv').describe()).toBe('exports/notes.csv');
  });

  it('normalize Windows separators', () => {
    expect(file('exports\\notes.csv').location).toMatchObject({ path: 'exports/notes.csv' });
  });

  it.each(['../config/secrets.yml', 'exports/../../etc/passwd', '/etc/passwd', 'C:\\Windows\\win.ini', 'data\\..\\..\\x', ''])(
    'refuse %j',
    (path) => {
      expect(() => file(path)).toThrowError(ValidationError);
    },
  );
});
