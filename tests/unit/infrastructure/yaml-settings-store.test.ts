import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ConfigError } from '../../../src/domain/errors.js';
import { YamlSettingsStore } from '../../../src/infrastructure/config/yaml-settings-store.js';

let dir: string;

const fileWith = async (name: string, body: string): Promise<string> => {
  const path = join(dir, name);
  await writeFile(path, body, 'utf8');
  return path;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-'));
});

describe('YamlSettingsStore.load', () => {
  it('maps snake_case YAML onto the camelCase domain shape', async () => {
    const path = await fileWith(
      'ok.yml',
      ['server:', '  host: 0.0.0.0', '  port: 9000', '  log_level: debug', 'cache:', '  ttl_seconds: 60'].join('\n'),
    );

    const settings = await new YamlSettingsStore(path).load();

    expect(settings.server).toEqual({ host: '0.0.0.0', port: 9000, logLevel: 'debug' });
    expect(settings.cache.ttlSeconds).toBe(60);
  });

  it('applies defaults for omitted sections', async () => {
    const path = await fileWith('empty.yml', 'server:\n  port: 1234\n');

    const settings = await new YamlSettingsStore(path).load();

    expect(settings.server.host).toBe('127.0.0.1');
    expect(settings.server.logLevel).toBe('info');
    expect(settings.management.cli).toBe(true);
    expect(settings.cache.ttlSeconds).toBe(300);
  });

  it('names the offending field when a value is out of range', async () => {
    const path = await fileWith('bad-port.yml', 'server:\n  port: 70000\n');

    await expect(new YamlSettingsStore(path).load()).rejects.toThrowError(/server\.port/);
  });

  it('fails with a ConfigError when the file is missing', async () => {
    await expect(new YamlSettingsStore(join(dir, 'nope.yml')).load()).rejects.toBeInstanceOf(ConfigError);
  });

  it('fails with a ConfigError when the YAML is malformed', async () => {
    const path = await fileWith('broken.yml', 'server:\n  port: [1, 2\n');

    await expect(new YamlSettingsStore(path).load()).rejects.toThrowError(/not valid YAML/);
  });

  it('loads the settings file that ships with the repo', async () => {
    const settings = await new YamlSettingsStore('config/settings.yml').load();

    expect(settings.server.port).toBe(8765);
    expect(settings.auth.mode).toBe('none');
  });
});
