import { ENDPOINTS, TIMEOUTS } from '../config.js';
import type { JsonRequester } from '../core/api-client.js';
import type { AppInput, AppWire, ProposalWire } from './app-types.js';

export interface InspectRequest {
  readonly input: string;
  readonly branch: string;
  /** Header values that reference saved keys. Never the keys themselves. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Everything the apps screen asks of the server. Components depend on this, never on fetch. */
export interface AppsGateway {
  list(): Promise<readonly AppWire[]>;
  inspect(request: InspectRequest): Promise<ProposalWire>;
  save(id: string, app: AppInput): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}

export class AppsApi implements AppsGateway {
  constructor(private readonly http: JsonRequester) {}

  async list(): Promise<readonly AppWire[]> {
    return (await this.http.request<{ apps: AppWire[] }>('GET', ENDPOINTS.apps)).apps;
  }

  async inspect(request: InspectRequest): Promise<ProposalWire> {
    const data = await this.http.request<{ proposal: ProposalWire }>('POST', ENDPOINTS.inspect, {
      body: request,
      timeoutMs: TIMEOUTS.inspectMs,
    });
    return data.proposal;
  }

  async save(id: string, app: AppInput): Promise<void> {
    await this.http.request('PUT', `${ENDPOINTS.apps}/${encodeURIComponent(id)}`, { body: app });
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.http.request('POST', `${ENDPOINTS.apps}/${encodeURIComponent(id)}/enabled`, { body: { enabled } });
  }

  async remove(id: string): Promise<void> {
    await this.http.request('DELETE', `${ENDPOINTS.apps}/${encodeURIComponent(id)}`);
  }
}
