import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import type { Settings } from '../../../src/domain/settings.js';
import { YamlSettingsStore } from '../../../src/infrastructure/config/yaml-settings-store.js';

let dir: string;
let path: string;

const store = (): YamlSettingsStore => new YamlSettingsStore(path, join(dir, 'backups'));

const settings = (over: Partial<Settings> = {}): Settings => ({
  server: { host: '0.0.0.0', port: 9100, logLevel: 'warn' },
  auth: { mode: 'token', token: 'owner-secret', publicUrl: 'https://stackvoice.example.com' },
  console: { enabled: true },
  simulator: { enabled: false },
  management: { cli: true },
  cache: { ttlSeconds: 120 },
  ...over,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-settings-'));
  path = join(dir, 'settings.yml');
});

describe('YamlSettingsStore.save', () => {
  it('round-trips every setting the console can edit', async () => {
    await store().save(settings());

    expect(await store().load()).toEqual(settings());
  });

  it('writes a file the loader validates, not just one that parses', async () => {
    await store().save(settings({ auth: { mode: 'oauth', token: 't', publicUrl: 'https://x.example' } }));

    const loaded = await store().load();

    expect(loaded.auth.mode).toBe('oauth');
    expect(loaded.auth.publicUrl).toBe('https://x.example');
  });

  it('keeps a token containing quotes and a hash intact', async () => {
    const tricky = 'a "quoted" # not-a-comment token';

    await store().save(settings({ auth: { mode: 'token', token: tricky, publicUrl: '' } }));

    expect((await store().load()).auth.token).toBe(tricky);
  });

  it('round-trips an empty token and an empty public address', async () => {
    await store().save(settings({ auth: { mode: 'none', token: '', publicUrl: '' } }));

    const loaded = await store().load();

    expect(loaded.auth).toEqual({ mode: 'none', token: '', publicUrl: '' });
  });

  it('has nothing to back up on the first write', async () => {
    expect(await store().save(settings())).toBeNull();
  });

  it('backs up the file it replaces', async () => {
    await writeFile(path, 'server:\n  port: 1234\n', 'utf8');

    const backup = await store().save(settings());

    expect(backup).not.toBeNull();
    expect(await readFile(backup as string, 'utf8')).toContain('port: 1234');
    expect((await store().load()).server.port).toBe(9100);
  });

  it('leaves no temporary file behind', async () => {
    await store().save(settings());

    await expect(readFile(`${path}.tmp`, 'utf8')).rejects.toThrow();
  });
});
