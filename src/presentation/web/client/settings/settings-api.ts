import { ENDPOINTS } from '../config.js';
import type { JsonRequester } from '../core/api-client.js';

export type AuthMode = 'none' | 'token' | 'oauth';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SettingsWire {
  readonly server: { readonly host: string; readonly port: number; readonly logLevel: LogLevel };
  /** Whether an owner token is set. The token itself never reaches the page. */
  readonly auth: { readonly mode: AuthMode; readonly tokenSet: boolean; readonly publicUrl: string };
  readonly console: { readonly enabled: boolean };
  readonly simulator: { readonly enabled: boolean };
  readonly cache: { readonly ttlSeconds: number };
  readonly sources: { readonly allowPrivateNetwork: boolean; readonly dataDir: string };
}

export interface SettingsView {
  readonly settings: SettingsWire;
  readonly endpoints: { readonly mcp: string };
}

export interface SettingsSaved extends SettingsView {
  readonly restartRequired: boolean;
}

/** An empty token means keep the one already set. */
export interface SettingsInput {
  readonly server: SettingsWire['server'];
  readonly auth: { readonly mode: AuthMode; readonly token: string; readonly publicUrl: string };
  readonly console: SettingsWire['console'];
  readonly simulator: SettingsWire['simulator'];
  readonly cache: SettingsWire['cache'];
  readonly sources: SettingsWire['sources'];
}

export interface SettingsGateway {
  load(): Promise<SettingsView>;
  save(settings: SettingsInput): Promise<SettingsSaved>;
}

export class SettingsApi implements SettingsGateway {
  constructor(private readonly http: JsonRequester) {}

  load(): Promise<SettingsView> {
    return this.http.request<SettingsView>('GET', ENDPOINTS.settings);
  }

  save(settings: SettingsInput): Promise<SettingsSaved> {
    return this.http.request<SettingsSaved>('PUT', ENDPOINTS.settings, { body: settings });
  }
}
