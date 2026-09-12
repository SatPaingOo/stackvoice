import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigError } from '../../../src/domain/errors.js';
import { Shortcut } from '../../../src/domain/shortcut.js';
import { YamlShortcutStore } from '../../../src/infrastructure/config/yaml-shortcut-store.js';

let dir: string;
let path: string;

const store = (): YamlShortcutStore => new YamlShortcutStore(path, join(dir, 'backups'));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-shortcuts-'));
  path = join(dir, 'shortcuts.yml');
});

describe('list', () => {
  it('returns nothing when the file does not exist, because shortcuts are optional', async () => {
    expect(await store().list()).toEqual([]);
  });

  it('returns nothing for an empty list', async () => {
    await writeFile(path, 'shortcuts: []\n', 'utf8');

    expect(await store().list()).toEqual([]);
  });

  it('reads a shortcut and its steps', async () => {
    await writeFile(
      path,
      [
        'shortcuts:',
        '  - name: "morning brief"',
        '    description: "Latest plus health."',
        '    steps:',
        '      - tool: library_search',
        '        args: {"limit": 2}',
        '      - tool: stack_status',
        '    reply: "Brief: {results}"',
      ].join('\n'),
      'utf8',
    );

    const [shortcut] = await store().list();

    expect(shortcut?.toolName).toBe('morning_brief');
    expect(shortcut?.enabled).toBe(true);
    expect(shortcut?.steps).toEqual([
      { tool: 'library_search', args: { limit: 2 } },
      { tool: 'stack_status', args: {} },
    ]);
    expect(shortcut?.reply).toBe('Brief: {results}');
  });

  it('names the offending field when a shortcut is invalid', async () => {
    await writeFile(path, 'shortcuts:\n  - name: "x"\n    steps: []\n', 'utf8');

    await expect(store().list()).rejects.toThrowError(/shortcuts\.0\.steps/);
  });

  it('reports a domain invariant as a ConfigError naming the file', async () => {
    const steps = Array.from({ length: 5 }, () => '      - tool: stack_status').join('\n');
    await writeFile(path, `shortcuts:\n  - name: "too many"\n    steps:\n${steps}\n`, 'utf8');

    await expect(store().list()).rejects.toBeInstanceOf(ConfigError);
  });

  it('fails on malformed YAML rather than silently ignoring it', async () => {
    await writeFile(path, 'shortcuts: [\n', 'utf8');

    await expect(store().list()).rejects.toThrowError(/not valid YAML/);
  });
});

describe('save', () => {
  const brief = new Shortcut({
    name: 'morning brief',
    description: 'Latest plus health.',
    enabled: true,
    reply: 'Brief: {results}',
    steps: [
      { tool: 'library_search', args: { limit: 2 } },
      { tool: 'stack_status', args: {} },
    ],
  });

  it('round-trips through the file', async () => {
    await store().save([brief]);

    const [read] = await store().list();

    expect(read?.name).toBe('morning brief');
    expect(read?.steps).toEqual(brief.steps);
    expect(read?.reply).toBe('Brief: {results}');
  });

  it('writes a file a person can still read', async () => {
    await store().save([brief]);

    const yaml = await readFile(path, 'utf8');

    expect(yaml).toContain('becomes the tool morning_brief');
    expect(yaml).toContain('- tool: library_search');
  });

  it('writes an empty list without leaving broken YAML', async () => {
    await store().save([brief]);
    await store().save([]);

    expect(await store().list()).toEqual([]);
  });

  it('backs up what it replaces', async () => {
    await store().save([brief]);

    const backup = await store().save([]);

    expect(backup).not.toBeNull();
    expect(await readFile(backup as string, 'utf8')).toContain('morning brief');
  });

  it('has no backup to take on the first write', async () => {
    expect(await store().save([brief])).toBeNull();
  });

  it('keeps a name containing a quote intact', async () => {
    const odd = new Shortcut({
      name: 'what is new',
      description: 'A "quoted" description.',
      enabled: true,
      reply: '',
      steps: [{ tool: 'stack_status', args: {} }],
    });

    await store().save([odd]);

    expect((await store().list())[0]?.description).toBe('A "quoted" description.');
  });
});
