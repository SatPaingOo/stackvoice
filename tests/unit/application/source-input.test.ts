import { describe, expect, it } from 'vitest';

import { parseSourceInput } from '../../../src/application/source-input.js';
import { ValidationError } from '../../../src/domain/errors.js';

describe('parseSourceInput', () => {
  it.each([
    ['SatPaingOo/information-hub', { type: 'github-repo', repo: 'SatPaingOo/information-hub' }],
    ['https://github.com/SatPaingOo/eventpulse', { type: 'github-repo', repo: 'SatPaingOo/eventpulse', branch: undefined }],
    ['https://github.com/me/data.git', { type: 'github-repo', repo: 'me/data', branch: undefined }],
    ['https://github.com/me/data/tree/gh-pages', { type: 'github-repo', repo: 'me/data', branch: 'gh-pages' }],
  ])('reads %s as a repository', (input, expected) => {
    expect(parseSourceInput(input)).toEqual(expected);
  });

  it.each([
    'https://feeds.bbci.co.uk/news/rss.xml',
    'https://github.com/nodejs/node/releases.atom',
    'https://api.github.com/repos/nodejs/node/releases',
    'http://192.168.1.20:3000/data.json',
  ])('reads %s as a link', (input) => {
    expect(parseSourceInput(input)).toMatchObject({ type: 'url', url: input });
  });

  it('carries headers along with a link', () => {
    expect(parseSourceInput('https://api.example.org/items', { Authorization: 'Bearer {{secret:KEY}}' })).toEqual({
      type: 'url',
      url: 'https://api.example.org/items',
      headers: { Authorization: 'Bearer {{secret:KEY}}' },
    });
  });

  it.each(['exports/notes.csv', 'feeds/podcast.xml', 'readings.json', 'deep/nested/folder/data.csv'])(
    'reads %s as a file',
    (input) => {
      expect(parseSourceInput(input)).toEqual({ type: 'file', path: input });
    },
  );

  it('trims what was pasted', () => {
    expect(parseSourceInput('  me/data  ')).toEqual({ type: 'github-repo', repo: 'me/data' });
  });

  it('refuses an empty box', () => {
    expect(() => parseSourceInput('   ')).toThrowError(ValidationError);
  });
});
