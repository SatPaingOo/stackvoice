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

export interface ConsoleSettings {
  /** Serves the web console at /console. How a non-developer adds their apps. */
  readonly enabled: boolean;
}

export interface SourceSettings {
  /**
   * Lets url sources reach addresses on a private network, such as a home server
   * or a service on the same machine. Off by default: on a server reachable from
   * the internet it would let anyone with console access read the local network.
   */
  readonly allowPrivateNetwork: boolean;
  /** Where file sources are read from, relative to the working directory. Nothing outside it is readable. */
  readonly dataDir: string;
}

export interface SimulatorSettings {
  /** Serves the simulated Alexa+ page at /simulator. The demo surface. */
  readonly enabled: boolean;
}

export interface CacheSettings {
  readonly ttlSeconds: number;
}

export interface Settings {
  readonly server: ServerSettings;
  readonly management: ManagementSettings;
  readonly auth: AuthSettings;
  readonly console: ConsoleSettings;
  readonly simulator: SimulatorSettings;
  readonly sources: SourceSettings;
  readonly cache: CacheSettings;
}
