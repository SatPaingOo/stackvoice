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
  /** Shared token required on every request while OAuth 2.1 lands in Stage 2. */
  readonly authToken: string;
}

export interface CacheSettings {
  readonly ttlSeconds: number;
}

export interface Settings {
  readonly server: ServerSettings;
  readonly management: ManagementSettings;
  readonly cache: CacheSettings;
}
