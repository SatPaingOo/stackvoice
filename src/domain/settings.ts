/**
 * Server settings as the core sees them: a plain, immutable shape. Parsing and
 * validation live in `infrastructure/config`; the domain only consumes the
 * result.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServerSettings {
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
}

export interface ManagementSettings {
  /** CLI face enabled. Web console and admin MCP tools are out of scope (FRAMEWORK.md §7). */
  readonly cli: boolean;
}

/**
 * How the MCP endpoint is protected.
 *
 * - `none`  — localhost development only.
 * - `token` — one shared bearer token; enough for a private tunnel.
 * - `oauth` — OAuth 2.1 with PKCE, which the Alexa+ MCP Toolkit requires.
 */
export type AuthMode = 'none' | 'token' | 'oauth';

export interface AuthSettings {
  readonly mode: AuthMode;
  /** The shared token in `token` mode; the consent secret in `oauth` mode. */
  readonly token: string;
  /** The canonical public https URI of this server. Required in `oauth` mode. */
  readonly publicUrl: string;
}

export interface CacheSettings {
  readonly ttlSeconds: number;
}

export interface Settings {
  readonly server: ServerSettings;
  readonly management: ManagementSettings;
  readonly auth: AuthSettings;
  readonly cache: CacheSettings;
}
