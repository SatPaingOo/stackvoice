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
const fileOf = (...lines: string[]): Promise<void> => writeFile(path, `${lines.join('\n')}\n`, 'utf8');

const LEGACY = [
  'shortcuts:',
  '  - name: "morning brief"',
  '    description: "Latest plus health."',
  '    steps:',
  '      - tool: library_search',
  '        args: {"limit": 2}',
  '      - tool: stack_status',
  '    reply: "Brief: {results}"',
];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-shortcuts-'));
  path = join(dir, 'shortcuts.yml');
});

describe('list', () => {
  it('returns nothing when the file does not exist, because shortcuts are optional', async () => {
    expect(await store().list()).toEqual([]);
  });

  it('returns nothing for an empty list', async () => {
    await fileOf('shortcuts: []');

    expect(await store().list()).toEqual([]);
  });

  it('reads a shortcut written before flows as blocks that behave the same', async () => {
    await fileOf(...LEGACY);

    const [shortcut] = await store().list();

    expect(shortcut?.toolName).toBe('morning_brief');
    expect(shortcut?.enabled).toBe(true);
    expect(shortcut?.blocks).toEqual([
      { kind: 'ask', tool: 'library_search', args: { limit: 2 }, as: 'step1' },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'step2' },
      { kind: 'say', text: 'Brief: {step1} {step2}' },
    ]);
  });

  it('reads the shorthand for every kind of block', async () => {
    await fileOf(
      'shortcuts:',
      '  - name: "news about topic"',
      '    triggers: ["news about {topic}", "anything on {topic}"]',
      '    blocks:',
      '      - ask: library_search',
      '        with: {"query": "{topic}", "limit": 3}',
      '        as: found',
      '      - if: {"count_of": "found", "is": 0}',
      '        then:',
      '          - say: "Nothing about {topic} yet."',
      '          - stop: true',
      '      - if: {"text": "{found.first.title}", "is_empty": true}',
      '        then: []',
      '        otherwise:',
      '          - get: item',
      '            from: found',
      '            index: 2',
      '            as: second',
      '          - set: line',
      '            to: "Then {second.title}"',
      '      - if: {"failed": "found"}',
      '        then:',
      '          - say: "{line}"',
    );

    const [shortcut] = await store().list();

    expect(shortcut?.slots).toEqual(['topic']);
    expect(shortcut?.blocks).toEqual([
      { kind: 'ask', tool: 'library_search', args: { query: '{topic}', limit: 3 }, as: 'found' },
      {
        kind: 'if',
        condition: { kind: 'count', variable: 'found', op: 'is', value: 0 },
        then: [{ kind: 'say', text: 'Nothing about {topic} yet.' }, { kind: 'stop' }],
        otherwise: [],
      },
      {
        kind: 'if',
        condition: { kind: 'text', template: '{found.first.title}', op: 'is_empty', value: '' },
        then: [],
        otherwise: [
          { kind: 'get', fn: 'item', from: 'found', index: 2, as: 'second' },
          { kind: 'set', name: 'line', to: 'Then {second.title}' },
        ],
      },
      { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [{ kind: 'say', text: '{line}' }], otherwise: [] },
    ]);
  });

  it('names the offending field when a shortcut is invalid', async () => {
    await fileOf('shortcuts:', '  - name: "x"', '    steps: []');

    await expect(store().list()).rejects.toThrowError(/shortcuts\.0\.steps/);
  });

  it('reports a domain invariant as a ConfigError naming the file', async () => {
    const steps = Array.from({ length: 5 }, () => '      - tool: stack_status');
    await fileOf('shortcuts:', '  - name: "too many"', '    steps:', ...steps);

    await expect(store().list()).rejects.toBeInstanceOf(ConfigError);
  });

  it('refuses a block that starts with two kinds at once', async () => {
    await fileOf('shortcuts:', '  - name: "odd"', '    blocks:', '      - say: "hi"', '        stop: true');

    await expect(store().list()).rejects.toThrowError(/exactly one of/);
  });

  it('refuses a shortcut with both blocks and steps, rather than guessing which to run', async () => {
    await fileOf(...LEGACY, '    blocks:', '      - say: "hi"');

    await expect(store().list()).rejects.toThrowError(/both blocks and steps/);
  });

  it('names the file when a block uses a name nothing sets', async () => {
    await fileOf('shortcuts:', '  - name: "typo"', '    blocks:', '      - say: "{nope}"');

    await expect(store().list()).rejects.toThrowError(/\{nope\} is used.*shortcuts\.yml/);
  });

  it('fails on malformed YAML rather than silently ignoring it', async () => {
    await fileOf('shortcuts: [');

    await expect(store().list()).rejects.toThrowError(/not valid YAML/);
  });
});

describe('save', () => {
  const brief = new Shortcut({
    name: 'morning brief',
    description: 'Latest plus health.',
    enabled: true,
    triggers: [],
    blocks: [
      { kind: 'ask', tool: 'library_search', args: { limit: 2 }, as: 'news' },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' },
      { kind: 'say', text: 'Brief: {news} {health}' },
    ],
  });

  const everything = new Shortcut({
    name: 'news about topic',
    description: 'News, or why there is none.',
    enabled: false,
    triggers: ['news about {topic}', 'anything on {topic}'],
    blocks: [
      { kind: 'ask', tool: 'library_search', args: { query: '{topic}', limit: 3, fresh: true }, as: 'found' },
      {
        kind: 'if',
        condition: { kind: 'count', variable: 'found', op: 'less_than', value: 1 },
        then: [{ kind: 'say', text: 'Nothing about {topic}: "yet".' }, { kind: 'stop' }],
        otherwise: [],
      },
      {
        kind: 'if',
        condition: { kind: 'text', template: '{found.first.title}', op: 'contains', value: 'gold' },
        then: [],
        otherwise: [{ kind: 'get', fn: 'item', from: 'found', index: 2, as: 'second' }],
      },
      // A name YAML would otherwise read as something other than text.
      { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [{ kind: 'set', name: 'null', to: '' }], otherwise: [] },
      { kind: 'say', text: '{found.count} about {topic}. {second.title} {null}' },
    ],
  });

  it('round-trips a flow with every kind of block and phrases with slots', async () => {
    await store().save([everything]);

    const [read] = await store().list();

    expect(read?.triggers).toEqual(everything.triggers);
    expect(read?.blocks).toEqual(everything.blocks);
    expect(read?.enabled).toBe(false);
  });

  it('writes the shorthand a person can still read and edit', async () => {
    await store().save([brief]);

    const yaml = await readFile(path, 'utf8');

    expect(yaml).toContain('becomes the tool morning_brief');
    expect(yaml).toContain('- ask: "library_search"');
    expect(yaml).toContain('- say: "Brief: {news} {health}"');
  });

  it('writes a shortcut from before flows back as blocks', async () => {
    await fileOf(...LEGACY);

    await store().save(await store().list());

    const yaml = await readFile(path, 'utf8');
    expect(yaml).toContain('blocks:');
    expect(yaml).not.toContain('steps:');
    expect((await store().list())[0]?.blocks.at(-1)).toEqual({ kind: 'say', text: 'Brief: {step1} {step2}' });
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

  it('keeps a description containing quotes intact', async () => {
    const odd = new Shortcut({
      name: 'what is new',
      description: 'A "quoted" description.',
      enabled: true,
      triggers: [],
      blocks: [{ kind: 'ask', tool: 'stack_status', args: {}, as: 'health' }],
    });

    await store().save([odd]);

    expect((await store().list())[0]?.description).toBe('A "quoted" description.');
  });
});
