import { ENDPOINTS } from '../config.js';
import type { JsonRequester } from '../core/api-client.js';
import type { ShortcutInput, ShortcutWire, ToolWire } from './shortcut-types.js';

/** Everything the shortcuts screen asks of the server. */
export interface ShortcutsGateway {
  list(): Promise<readonly ShortcutWire[]>;
  tools(): Promise<readonly ToolWire[]>;
  create(shortcut: ShortcutInput): Promise<void>;
  /** Replaces the shortcut currently called `name`, which is how a rename keeps its place. */
  update(name: string, shortcut: ShortcutInput): Promise<void>;
  remove(name: string): Promise<void>;
}

export class ShortcutsApi implements ShortcutsGateway {
  constructor(private readonly http: JsonRequester) {}

  async list(): Promise<readonly ShortcutWire[]> {
    return (await this.http.request<{ shortcuts: ShortcutWire[] }>('GET', ENDPOINTS.shortcuts)).shortcuts;
  }

  async tools(): Promise<readonly ToolWire[]> {
    return (await this.http.request<{ tools: ToolWire[] }>('GET', ENDPOINTS.tools)).tools;
  }

  async create(shortcut: ShortcutInput): Promise<void> {
    await this.http.request('POST', ENDPOINTS.shortcuts, { body: shortcut });
  }

  async update(name: string, shortcut: ShortcutInput): Promise<void> {
    await this.http.request('PUT', `${ENDPOINTS.shortcuts}/${encodeURIComponent(name)}`, { body: shortcut });
  }

  async remove(name: string): Promise<void> {
    await this.http.request('DELETE', `${ENDPOINTS.shortcuts}/${encodeURIComponent(name)}`);
  }
}
