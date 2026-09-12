import type { Item, SearchParams } from './item.js';

/**
 * How a match is ranked.
 *
 * Sorting purely by date is wrong for a spoken answer: asked about Myanmar, a
 * long article that merely mentions Myanmar in passing must not outrank the
 * article that is *about* Myanmar. A voice assistant reads back only the first
 * two or three results, so the first result has to be the right one.
 *
 * Title hits therefore weigh more than summary hits, and date only breaks ties.
 */
const TITLE_WEIGHT = 3;
const SUMMARY_WEIGHT = 1;

/** Query words shorter than this are ignored as noise. */
const MIN_WORD_LENGTH = 2;

export function queryWords(query: string | undefined): readonly string[] {
  if (query === undefined) return [];
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD_LENGTH);
}

/**
 * A word matches at a word boundary, never mid-word.
 *
 * Plain substring matching is a trap here: asked about "AI", `includes('ai')`
 * matches "claim", "major" and "Tragic", and the answer read back out loud is
 * nonsense. Words of three characters or fewer must match whole; longer words
 * may match as a prefix, so "myanmar" still finds "Myanmar's".
 */
function wordMatches(haystack: string, word: string): boolean {
  // `queryWords` already stripped everything that is not a letter or digit, so
  // the word is safe to drop straight into a pattern.
  const pattern = word.length <= 3 ? `\\b${word}\\b` : `\\b${word}`;
  return new RegExp(pattern, 'u').test(haystack);
}

/**
 * True when the item satisfies the filters and at least one query word hits.
 *
 * Requiring *every* word is wrong for speech: "what happened in Myanmar" would
 * find nothing, because no article contains all four words. Ranking decides the
 * order, so a one-word match is allowed to compete and simply loses.
 */
export function matchesItem(item: Item, params: SearchParams): boolean {
  if (params.topic !== undefined && !containsFold(item.topic, params.topic)) return false;
  if (params.region !== undefined && !containsFold(item.region, params.region)) return false;

  const words = queryWords(params.query);
  if (words.length === 0) return true;

  const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
  return words.some((word) => wordMatches(haystack, word));
}

/** Relevance of one item to the query. Zero when there is no query to score against. */
export function scoreItem(item: Item, params: SearchParams): number {
  const words = queryWords(params.query);
  if (words.length === 0) return 0;

  const title = item.title.toLowerCase();
  const summary = (item.summary ?? '').toLowerCase();

  let score = 0;
  for (const word of words) {
    if (wordMatches(title, word)) score += TITLE_WEIGHT;
    else if (wordMatches(summary, word)) score += SUMMARY_WEIGHT;
  }
  return score;
}

/** Filters, then orders by relevance with date as the tiebreaker. Newest first. */
export function rankItems(items: readonly Item[], params: SearchParams): readonly Item[] {
  return items
    .filter((item) => matchesItem(item, params))
    .map((item) => ({ item, score: scoreItem(item, params) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return compareDateDescending(a.item.date, b.item.date);
    })
    .map((scored) => scored.item);
}

/** Undated entries sort last. */
function compareDateDescending(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

function containsFold(value: string | null, wanted: string): boolean {
  return value !== null && value.toLowerCase().includes(wanted.toLowerCase());
}
