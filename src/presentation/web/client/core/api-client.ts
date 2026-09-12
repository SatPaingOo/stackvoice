import { ENDPOINTS, TIMEOUTS } from '../config.js';

/** A request the server refused or could not answer, carrying the message it gave. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

/** What every gateway needs from the network, and nothing more. */
export interface JsonRequester {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
}

/**
 * The one way the console talks to its server: JSON in and out, a time limit on
 * every request, and a single place that sends a signed-out person to sign in.
 */
export class ApiClient implements JsonRequester {
  constructor(private readonly onSignedOut: () => void = redirectToSignin) {}

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUTS.requestMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
      throw new ApiError(timedOut ? 'The server took too long to answer.' : 'Could not reach the server.', 0, null);
    }

    const data = (await response.json().catch(() => ({}))) as { error?: unknown; field?: unknown };
    const message = typeof data.error === 'string' ? data.error : null;

    if (response.status === 401) {
      this.onSignedOut();
      throw new ApiError(message ?? 'Sign in first.', 401, null);
    }
    if (!response.ok) {
      throw new ApiError(message ?? 'That did not work.', response.status, typeof data.field === 'string' ? data.field : null);
    }
    return data as T;
  }
}

/** What to tell a person when something they did failed. */
export function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'That did not work.';
}

function redirectToSignin(): void {
  window.location.href = `${ENDPOINTS.signin}?next=${encodeURIComponent(window.location.pathname)}`;
}
