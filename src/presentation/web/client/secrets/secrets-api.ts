import { ENDPOINTS } from '../config.js';
import type { JsonRequester } from '../core/api-client.js';

export interface SecretSummary {
  readonly name: string;
  readonly usedBy: readonly string[];
}

/**
 * Saved API keys. A value goes in through `save` and there is no way to read one
 * back, because the server offers none.
 */
export interface SecretsGateway {
  list(): Promise<readonly SecretSummary[]>;
  save(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export class SecretsApi implements SecretsGateway {
  constructor(private readonly http: JsonRequester) {}

  async list(): Promise<readonly SecretSummary[]> {
    return (await this.http.request<{ secrets: SecretSummary[] }>('GET', ENDPOINTS.secrets)).secrets;
  }

  async save(name: string, value: string): Promise<void> {
    await this.http.request('PUT', `${ENDPOINTS.secrets}/${encodeURIComponent(name)}`, { body: { value } });
  }

  async remove(name: string): Promise<void> {
    await this.http.request('DELETE', `${ENDPOINTS.secrets}/${encodeURIComponent(name)}`);
  }
}
