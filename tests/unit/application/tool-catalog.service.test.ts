import { describe, expect, it } from 'vitest';

import { ToolCatalogService } from '../../../src/application/tool-catalog.service.js';
import { AppDefinition } from '../../../src/domain/app-definition.js';
import { Shortcut } from '../../../src/domain/shortcut.js';
import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
} from '../../../src/domain/data-source.js';

const source = new DataSource({
  id: 's',
  type: 'github-repo',
  label: 's',
  repo: 'owner/name',
  viewsDir: 'data/views',
  statsFile: 'data/views/stats.json',
  indexFile: 'data/views/index.json',
  itemsPath: null,
  fields: DEFAULT_FIELD_MAP,
  statusFields: DEFAULT_STATUS_FIELD_MAP,
});

const app = (
  id: string,
  primitives: { search: boolean; read: boolean; status: boolean },
  enabled = true,
): AppDefinition =>
  new AppDefinition({
    id,
    label: `${id} label`,
    description: 'What this app holds.',
    enabled,
    primitives,
    sources: [source],
  });

const catalog = new ToolCatalogService();
const names = (apps: AppDefinition[]): string[] => catalog.generate(apps).map((spec) => spec.name);

const shortcut = (name: string, enabled = true): Shortcut =>
  new Shortcut({
    name,
    description: 'What it does.',
    enabled,
    triggers: [],
    blocks: [
      { kind: 'ask', tool: 'library_search', args: {}, as: 'news' },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' },
    ],
  });

describe('shortcuts in the catalog', () => {
  it('adds one tool per enabled shortcut, after the generated ones', () => {
    const apps = [app('library', { search: true, read: false, status: false })];

    expect(catalog.generate(apps, [shortcut('morning brief')]).map((spec) => spec.name)).toEqual([
      'stack_status',
      'library_search',
      'morning_brief',
    ]);
  });

  it('skips a disabled shortcut', () => {
    expect(catalog.generate([], [shortcut('morning brief', false)]).map((s) => s.name)).toEqual([
      'stack_status',
    ]);
  });

  it('never lets a shortcut shadow a generated tool', () => {
    const apps = [app('library', { search: true, read: false, status: false })];

    const specs = catalog.generate(apps, [shortcut('library search')]);

    expect(specs.filter((spec) => spec.name === 'library_search')).toHaveLength(1);
    expect(specs.find((spec) => spec.name === 'library_search')?.verb).toBe('search');
  });

  it('tells the assistant what the shortcut runs and when to use it', () => {
    const spec = catalog.generate([], [shortcut('morning brief')])[1];

    expect(spec?.description).toContain('library_search and stack_status');
    expect(spec?.description).toContain('"morning brief"');
    expect(spec?.shortcutName).toBe('morning brief');
  });
});

describe('ToolCatalogService.generate', () => {
  it('always exposes the global tool, even with no apps', () => {
    expect(names([])).toEqual(['stack_status']);
  });

  it('namespaces one tool per enabled verb', () => {
    expect(names([app('library', { search: true, read: true, status: true })])).toEqual([
      'stack_status',
      'library_search',
      'library_read',
      'library_status',
    ]);
  });

  it('generates nothing for a disabled app', () => {
    expect(names([app('hidden', { search: true, read: true, status: true }, false)])).toEqual([
      'stack_status',
    ]);
  });

  it('handles apps whose primitives differ', () => {
    const apps = [
      app('library', { search: true, read: true, status: true }),
      app('markets', { search: false, read: false, status: true }),
    ];

    expect(names(apps)).toEqual([
      'stack_status',
      'library_search',
      'library_read',
      'library_status',
      'markets_status',
    ]);
  });

  it('builds the description from the app label and description, so the assistant knows when to call it', () => {
    const spec = catalog
      .generate([app('library', { search: true, read: false, status: false })])
      .find((candidate) => candidate.name === 'library_search');

    expect(spec?.description).toContain('library label');
    expect(spec?.description).toContain('What this app holds.');
  });

  it('tags each spec with its app and verb', () => {
    const specs = catalog.generate([app('library', { search: true, read: false, status: false })]);

    expect(specs.map((s) => [s.name, s.appId, s.verb])).toEqual([
      ['stack_status', null, 'stack_status'],
      ['library_search', 'library', 'search'],
    ]);
  });
});
