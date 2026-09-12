/**
 * The normalized record every source type resolves to.
 *
 * Adapters map their own payloads onto this shape, so the search, read and
 * shaping code never learns that one app calls a field `tldr` and another calls
 * it `summary` (Liskov: any reader returns these, and nothing else).
 */
export interface Item {
  readonly key: string;
  readonly title: string;
  readonly summary: string | null;
  readonly date: string | null;
  readonly topic: string | null;
  readonly region: string | null;
  readonly url: string | null;
}

export interface SearchParams {
  readonly query?: string | undefined;
  readonly topic?: string | undefined;
  readonly region?: string | undefined;
  readonly limit: number;
}

export const SEARCH_LIMIT_DEFAULT = 5;
export const SEARCH_LIMIT_MAX = 10;
