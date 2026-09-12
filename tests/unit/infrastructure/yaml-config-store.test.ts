import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigError } from '../../../src/domain/errors.js';
import { YamlConfigStore } from '../../../src/infrastructure/config/yaml-config-store.js';

let dir: string;

const valid = (id: string): string =>
  [
    `id: ${id}`,
    `label: "${id} label"`,
    'description: "what it holds"',
    'primitives:',
    '  search: true',
    'sources:',
    '  - id: s1',
    '    type: github-repo',
    '    label: "a source"',
    '    repo: owner/name',
    '',
  ].join('\n');

const write = async (name: string, body: string): Promise<void> => {
  await writeFile(join(dir, name), body, 'utf8');
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-apps-'));
});

describe('YamlConfigStore.listApps', () => {
  it('loads every app file and applies documented defaults', async () => {
    await write('library.yml', valid('library'));

    const [app] = await new YamlConfigStore(dir).listApps();

    expect(app?.id).toBe('library');
    expect(app?.enabled).toBe(true);
    expect(app?.enabledVerbs()).toEqual(['search']);
    const source = app?.primarySource();
    expect(source?.location).toEqual({
      type: 'github-repo',
      repo: 'owner/name',
      branch: 'main',
      viewsDir: 'data/views',
      indexFile: 'data/views/index.json',
      statsFile: 'data/views/stats.json',
    });
    expect(source?.itemsPath).toBeNull();
    expect(source?.fields.summary).toBe('summary');
    expect(source?.statusFields.itemCount).toBe('total_items');
  });

  it('ignores files that are not YAML', async () => {
    await write('library.yml', valid('library'));
    await write('README.md', '# not config');

    expect(await new YamlConfigStore(dir).listApps()).toHaveLength(1);
  });

  it('returns an empty list for an empty directory', async () => {
    expect(await new YamlConfigStore(dir).listApps()).toEqual([]);
  });

  it('rejects a file whose name does not match its id', async () => {
    await write('wrong-name.yml', valid('library'));

    await expect(new YamlConfigStore(dir).listApps()).rejects.toThrowError(/does not match the filename/);
  });

  it('names the offending field when validation fails', async () => {
    await write('library.yml', valid('library').replace('repo: owner/name', 'repo: x'));

    await expect(new YamlConfigStore(dir).listApps()).rejects.toThrowError(/sources\.0\.repo/);
  });

  it('rejects an unknown source type', async () => {
    await write('library.yml', valid('library').replace('type: github-repo', 'type: carrier-pigeon'));

    await expect(new YamlConfigStore(dir).listApps()).rejects.toBeInstanceOf(ConfigError);
  });

  it('surfaces a domain invariant as a ConfigError naming the file', async () => {
    await write('library.yml', `${valid('library')}  - id: s1\n    type: github-repo\n    label: "dup"\n    repo: owner/name\n`);

    await expect(new YamlConfigStore(dir).listApps()).rejects.toThrowError(/duplicate source id/);
  });

  it('fails when the directory does not exist', async () => {
    await expect(new YamlConfigStore(join(dir, 'missing')).listApps()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('the configs that ship with the repo', () => {
  it('load, and expose the tools the docs promise', async () => {
    const apps = await new YamlConfigStore('config/apps').listApps();

    expect(apps.map((app) => app.id)).toEqual(['library', 'markets']);

    const library = apps.find((app) => app.id === 'library');
    expect(library?.primarySource().fields.summary).toBe('tldr');
    expect(library?.primarySource().itemsPath).toBeNull();

    const markets = apps.find((app) => app.id === 'markets');
    expect(markets?.primarySource().itemsPath).toBe('recent_events');
    expect(markets?.primarySource().fields.key).toBe('id');
    expect(markets?.primarySource().statusFields.itemCount).toBe('stats.events');
  });
});
