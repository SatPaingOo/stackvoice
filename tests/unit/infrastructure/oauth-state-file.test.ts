import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { JsonOAuthStateFile, type OAuthState } from '../../../src/infrastructure/auth/oauth-state-file.js';

const HASH = 'a'.repeat(64);

const state: OAuthState = {
  clients: [
    {
      client: {
        client_id: 'c1',
        client_id_issued_at: 1_790_000_000,
        client_name: 'Claude Code',
        redirect_uris: ['http://localhost:45093/callback'],
        token_endpoint_auth_method: 'none',
      },
      lastUsedAt: 1_790_000_100,
    },
  ],
  refreshTokens: [
    {
      hash: HASH,
      clientId: 'c1',
      scopes: ['stackvoice:read'],
      resource: 'http://127.0.0.1:8765/mcp',
      expiresAt: 1_792_000_000,
    },
  ],
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-oauth-'));
});

describe('JsonOAuthStateFile', () => {
  it('reads nothing before anything was saved', async () => {
    expect(await new JsonOAuthStateFile(join(dir, 'oauth.json')).load()).toEqual({ clients: [], refreshTokens: [] });
  });

  it('round-trips clients and refresh tokens, leaving no temporary file behind', async () => {
    const path = join(dir, 'config', 'oauth.json');

    await new JsonOAuthStateFile(path).save(state);

    expect(await new JsonOAuthStateFile(path).load()).toEqual(state);
    expect(await readdir(join(dir, 'config'))).toEqual(['oauth.json']);
  });

  it('reads a damaged file as empty, so clients register again rather than the server failing', async () => {
    const path = join(dir, 'oauth.json');
    await writeFile(path, '{ not json', 'utf8');
    expect(await new JsonOAuthStateFile(path).load()).toEqual({ clients: [], refreshTokens: [] });

    await writeFile(path, JSON.stringify({ clients: [], refreshTokens: [{ hash: 'not a digest' }] }), 'utf8');
    expect(await new JsonOAuthStateFile(path).load()).toEqual({ clients: [], refreshTokens: [] });
  });

  it('drops a client entry it cannot read and keeps the rest', async () => {
    const path = join(dir, 'oauth.json');
    const broken = { client: { client_name: 'no id, no redirect' }, lastUsedAt: 1 };
    await writeFile(path, JSON.stringify({ ...state, clients: [broken, ...state.clients] }), 'utf8');

    const loaded = await new JsonOAuthStateFile(path).load();

    expect(loaded.clients.map(({ client }) => client.client_id)).toEqual(['c1']);
    expect(loaded.refreshTokens).toHaveLength(1);
  });
});
