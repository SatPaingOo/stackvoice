import { describe, expect, it } from 'vitest';

import { AppDefinition } from '../../../src/domain/app-definition.js';
import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
} from '../../../src/domain/data-source.js';
import { ValidationError } from '../../../src/domain/errors.js';

const source = (id: string, repo = 'owner/name'): DataSource =>
  new DataSource({
    id,
    type: 'github-repo',
    label: id,
    repo,
    viewsDir: 'data/views',
    statsFile: 'data/views/stats.json',
    indexFile: 'data/views/index.json',
    itemsPath: null,
    fields: DEFAULT_FIELD_MAP,
    statusFields: DEFAULT_STATUS_FIELD_MAP,
  });

const app = (over: Partial<ConstructorParameters<typeof AppDefinition>[0]> = {}): AppDefinition =>
  new AppDefinition({
    id: 'library',
    label: 'Deep-dive library',
    description: 'Articles.',
    enabled: true,
    primitives: { search: true, read: true, status: true },
    sources: [source('library')],
    ...over,
  });

describe('DataSource', () => {
  it('rejects a repository that is not owner/name', () => {
    expect(() => source('s', 'not-a-repo')).toThrowError(ValidationError);
  });

  it('accepts dots in the repository name', () => {
    expect(() => source('s', 'owner/name.js')).not.toThrow();
  });
});

describe('AppDefinition invariants', () => {
  it('rejects an id with uppercase or underscores', () => {
    expect(() => app({ id: 'My_App' })).toThrowError(/must be lowercase/);
  });

  it('rejects an id that is a single character', () => {
    expect(() => app({ id: 'x' })).toThrowError(ValidationError);
  });

  it('rejects an app with no sources', () => {
    expect(() => app({ sources: [] })).toThrowError(/at least one source/);
  });

  it('rejects duplicate source ids', () => {
    expect(() => app({ sources: [source('dup'), source('dup')] })).toThrowError(/duplicate source id/);
  });
});

describe('AppDefinition.enabledVerbs', () => {
  it('returns only the enabled verbs, in a stable order', () => {
    expect(app({ primitives: { search: false, read: true, status: true } }).enabledVerbs()).toEqual([
      'read',
      'status',
    ]);
  });

  it('returns nothing when every primitive is off', () => {
    expect(app({ primitives: { search: false, read: false, status: false } }).enabledVerbs()).toEqual([]);
  });
});
