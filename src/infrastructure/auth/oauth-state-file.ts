import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { z } from 'zod';

/** A registered client, and when it last signed in or refreshed. */
export interface StoredClient {
  readonly client: OAuthClientInformationFull;
  /** Seconds since the epoch. */
  readonly lastUsedAt: number;
}

/** A refresh token as kept on disk: its SHA-256, never the token itself. */
export interface StoredRefreshToken {
  readonly hash: string;
  readonly clientId: string;
  readonly scopes: string[];
  readonly resource: string | undefined;
  /** Seconds since the epoch. */
  readonly expiresAt: number;
}

/** What the authorization server keeps across a restart. */
export interface OAuthState {
  readonly clients: readonly StoredClient[];
  readonly refreshTokens: readonly StoredRefreshToken[];
}

/** Where `LocalOAuthProvider` keeps its state between runs. */
export interface OAuthStatePort {
  load(): Promise<OAuthState>;
  save(state: OAuthState): Promise<void>;
}

const EMPTY: OAuthState = { clients: [], refreshTokens: [] };

const fileSchema = z.object({
  clients: z.array(z.object({ client: z.unknown(), lastUsedAt: z.number() })),
  refreshTokens: z.array(
    z.object({
      hash: z.string().regex(/^[0-9a-f]{64}$/),
      clientId: z.string(),
      scopes: z.array(z.string()),
      resource: z.string().optional(),
      expiresAt: z.number(),
    }),
  ),
});

/**
 * `config/oauth.json`: the clients that registered themselves and the refresh
 * tokens they hold, so a restart does not sign anyone out.
 *
 * Refresh tokens are stored as SHA-256 digests, so the file cannot be used to
 * sign in. A client that registered with a client secret keeps it here as the
 * SDK issued it, which is why the file is git-ignored like `secrets.yml`.
 * Access tokens and authorization codes never reach the disk: they last an hour
 * and five minutes, and a client gets a new access token with its refresh token.
 *
 * A missing or damaged file reads as empty, and a damaged client entry is
 * dropped: the worst outcome is that a client registers and signs in again,
 * which is where every client stood before this file existed.
 */
export class JsonOAuthStateFile implements OAuthStatePort {
  constructor(private readonly filePath: string) {}

  async load(): Promise<OAuthState> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch {
      return EMPTY;
    }
    let parsed: z.infer<typeof fileSchema>;
    try {
      const result = fileSchema.safeParse(JSON.parse(text));
      if (!result.success) return EMPTY;
      parsed = result.data;
    } catch {
      return EMPTY;
    }

    const clients: StoredClient[] = [];
    for (const entry of parsed.clients) {
      const client = OAuthClientInformationFullSchema.safeParse(entry.client);
      if (client.success) clients.push({ client: client.data, lastUsedAt: entry.lastUsedAt });
    }
    const refreshTokens = parsed.refreshTokens.map((token) => ({ ...token, resource: token.resource }));
    return { clients, refreshTokens };
  }

  /** Written to a temporary file and renamed, so a crash never leaves half a file. */
  async save(state: OAuthState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
