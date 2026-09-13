import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { SourceUnavailableError, ValidationError } from '../../../src/domain/errors.js';
import { resolveHeaders } from '../../../src/infrastructure/config/secret-headers.js';
import { YamlSecretStore } from '../../../src/infrastructure/config/yaml-secret-store.js';

let path: string;

beforeEach(async () => {
  path = join(await mkdtemp(join(tmpdir(), 'stackvoice-secrets-')), 'secrets.yml');
});

describe('YamlSecretStore', () => {
  it('has nothing when the file does not exist', async () => {
    const store = new YamlSecretStore(path, {});
    expect(await store.get('NOTION_TOKEN')).toBeNull();
    expect(await store.names()).toEqual([]);
  });

  it('keeps a secret it is given', async () => {
    await new YamlSecretStore(path, {}).set('NOTION_TOKEN', 'secret-value');

    expect(await new YamlSecretStore(path, {}).get('NOTION_TOKEN')).toBe('secret-value');
  });

  it('lists names and never values', async () => {
    const store = new YamlSecretStore(path, {});
    await store.set('NOTION_TOKEN', 'secret-value');

    const names = await store.names();

    expect(names).toEqual(['NOTION_TOKEN']);
    expect(JSON.stringify(names)).not.toContain('secret-value');
  });

  it('lets an environment variable supply or override a secret', async () => {
    const store = new YamlSecretStore(path, { STACKVOICE_SECRET_NOTION_TOKEN: 'from-env' });
    await store.set('NOTION_TOKEN', 'from-file');

    expect(await store.get('NOTION_TOKEN')).toBe('from-env');
    expect(await store.names()).toEqual(['NOTION_TOKEN']);
  });

  it('refuses a malformed name', async () => {
    await expect(new YamlSecretStore(path, {}).set('notion token', 'x')).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an empty value', async () => {
    await expect(new YamlSecretStore(path, {}).set('NOTION_TOKEN', '  ')).rejects.toThrowError(/empty/);
  });

  it('removes a secret', async () => {
    const store = new YamlSecretStore(path, {});
    await store.set('NOTION_TOKEN', 'x');
    await store.remove('NOTION_TOKEN');

    expect(await store.get('NOTION_TOKEN')).toBeNull();
  });

  it('ignores entries that are not valid secrets', async () => {
    await writeFile(path, 'secrets:\n  GOOD_ONE: "yes"\n  bad name: "no"\n  NUMBER: 42\n', 'utf8');

    expect(await new YamlSecretStore(path, {}).names()).toEqual(['GOOD_ONE']);
  });

  it('marks the file as a secret file', async () => {
    await new YamlSecretStore(path, {}).set('NOTION_TOKEN', 'x');

    expect(await readFile(path, 'utf8')).toContain('Never commit');
    // Owner-only permissions only mean something where the file system has them.
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o077).toBe(0);
    }
  });
});

describe('resolveHeaders', () => {
  it('fills in secret references and leaves other text alone', async () => {
    const store = new YamlSecretStore(path, { STACKVOICE_SECRET_NOTION_TOKEN: 'abc123' });

    const headers = await resolveHeaders(
      { Authorization: 'Bearer {{secret:NOTION_TOKEN}}', 'Notion-Version': '2022-06-28' },
      store,
      'notes',
    );

    expect(headers).toEqual({ Authorization: 'Bearer abc123', 'Notion-Version': '2022-06-28' });
  });

  it('names the secret that is missing', async () => {
    const store = new YamlSecretStore(path, {});

    await expect(
      resolveHeaders({ Authorization: 'Bearer {{secret:NOTION_TOKEN}}' }, store, 'notes'),
    ).rejects.toThrowError(SourceUnavailableError);
    await expect(
      resolveHeaders({ Authorization: 'Bearer {{secret:NOTION_TOKEN}}' }, store, 'notes'),
    ).rejects.toThrowError(/NOTION_TOKEN/);
  });
});
