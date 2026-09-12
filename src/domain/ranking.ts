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

/** True when the item satisfies every constraint in `params`. */
export function matchesItem(item: Item, params: SearchParams): boolean {
  if (params.topic !== undefined && !containsFold(item.topic, params.topic)) return false;
  if (params.region !== undefined && !containsFold(item.region, params.region)) return false;

  const words = queryWords(params.query);
  if (words.length === 0) return true;

  const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Relevance of one item to the query. Zero when there is no query to score against. */
export function scoreItem(item: Item, params: SearchParams): number {
  const words = queryWords(params.query);
  if (words.length === 0) return 0;

  const title = item.title.toLowerCase();
  const summary = (item.summary ?? '').toLowerCase();

  let score = 0;
  for (const word of words) {
    if (title.includes(word)) score += TITLE_WEIGHT;
    else if (summary.includes(word)) score += SUMMARY_WEIGHT;
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
