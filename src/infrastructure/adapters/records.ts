import type { FieldMap } from '../../domain/data-source.js';
import type { Item } from '../../domain/item.js';
import type { FieldEvidence } from '../../domain/source-proposal.js';
import { readString } from './dot-path.js';

/**
 * Turning an unfamiliar document into records a person can hear: finding the
 * list, guessing which field is which, and reading an item through a field map.
 *
 * Every source type ends up here. A GitHub read model, an RSS feed and a CSV row
 * all arrive as plain objects, so the guessing is written once.
 */

export type InferredFields = { readonly [K in keyof FieldMap]: string | null };

type Plain = Record<string, unknown>;

/**
 * Candidate keys per field, best first. The first key that holds a usable value
 * on most records wins, which keeps a guess explainable: a person can see why
 * `tldr` became the summary. Matching ignores case, because CSV headers say
 * `Date` where JSON says `date`.
 */
const CANDIDATES: Record<keyof FieldMap, readonly string[]> = {
  key: ['key', 'id', 'guid', 'slug', 'uuid', 'ref'],
  title: ['title', 'headline', 'name', 'subject', 'label', 'summary'],
  summary: ['tldr', 'summary', 'description', 'abstract', 'excerpt', 'blurb', 'snippet', 'content', 'body', 'text'],
  date: [
    'date',
    'published',
    'published_at',
    'pubDate',
    'date_utc',
    'created_at',
    'updated_at',
    'updated',
    'timestamp',
    'time',
    'dt',
  ],
  topic: ['topic', 'category', 'collection', 'event_type', 'type', 'kind', 'section'],
  region: ['region', 'country', 'market', 'location', 'place', 'city'],
  // A page a person can open before an API's own address: GitHub's `url` is api.github.com, `html_url` the page.
  url: ['link', 'html_url', 'permalink', 'source_url', 'url', 'href'],
};

/** How much a field contributes to a spoken answer, for choosing between lists. */
const WEIGHT: Record<keyof FieldMap, number> = { title: 4, summary: 3, date: 2, key: 2, topic: 1, region: 1, url: 1 };

const MAX_DEPTH = 3;
const SAMPLE_SIZE = 10;

export function isPlainObject(value: unknown): value is Plain {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isRecordList(value: unknown): value is Plain[] {
  return Array.isArray(value) && value.length > 0 && value.slice(0, 5).every(isPlainObject);
}

/**
 * The list of records to expose: the document itself, or the most readable list
 * within its first few levels.
 *
 * Most readable, not longest. eventpulse publishes 39 price rows beside 10
 * events, and only the events have anything to say.
 */
export function locateItems(document: unknown): { path: string | null; items: Plain[] } | null {
  if (isRecordList(document)) return { path: null, items: document };

  let best: { path: string; items: Plain[]; score: number } | null = null;
  const stack: { value: unknown; path: string; depth: number }[] = [{ value: document, path: '', depth: 1 }];

  while (stack.length > 0) {
    const { value, path, depth } = stack.pop() as { value: unknown; path: string; depth: number };
    if (depth > MAX_DEPTH || !isPlainObject(value)) continue;

    for (const [key, child] of Object.entries(value)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      if (isRecordList(child)) {
        const score = readability(child);
        if (best === null || score > best.score || (score === best.score && child.length > best.items.length)) {
          best = { path: childPath, items: child, score };
        }
      } else {
        stack.push({ value: child, path: childPath, depth: depth + 1 });
      }
    }
  }

  return best === null ? null : { path: best.path, items: best.items };
}

/** A guessed key per field. A field that comes back null really is absent from the data. */
export function inferFields(items: readonly unknown[]): InferredFields {
  const sample = items.slice(0, SAMPLE_SIZE);
  const pick = (field: keyof FieldMap): string | null => {
    for (const candidate of CANDIDATES[field]) {
      const actual = matchKey(sample, candidate);
      if (actual !== null) return actual;
    }
    return null;
  };

  return {
    key: pick('key'),
    title: pick('title'),
    summary: pick('summary'),
    date: pick('date'),
    topic: pick('topic'),
    region: pick('region'),
    url: pick('url'),
  };
}

/**
 * A title for records that have none of their own: the first two columns that
 * hold text, joined. A row of `Date,Price` then reads "1833-01: 18.930" instead
 * of being refused.
 */
export function fallbackTitle(items: readonly unknown[]): string | null {
  const sample = items.slice(0, SAMPLE_SIZE);
  const first = sample.find(isPlainObject);
  if (first === undefined) return null;

  const columns = Object.keys(first)
    .filter((key) => usableOnMost(sample, key))
    .slice(0, 2);

  if (columns.length === 0) return null;
  return columns.length === 1 ? (columns[0] as string) : `{${columns[0] as string}}: {${columns[1] as string}}`;
}

/**
 * Reads one item through a field map. Key and title are required: a record the
 * assistant cannot name, or cannot read back later, is skipped rather than
 * invented.
 */
export function toItem(entry: unknown, fields: FieldMap): Item | null {
  const key = resolveField(entry, fields.key);
  const title = resolveField(entry, fields.title);
  if (key === null || title === null) return null;

  return {
    key,
    title,
    summary: resolveField(entry, fields.summary),
    date: normalizeDate(resolveField(entry, fields.date)),
    topic: resolveField(entry, fields.topic),
    region: resolveField(entry, fields.region),
    url: resolveField(entry, fields.url),
  };
}

/**
 * A field value: a dot path, or a template such as `{Date}: {Price}`. When part
 * of a template is missing, the separators around it go too, so a row with no
 * price reads "1833-01" rather than "1833-01: ".
 */
export function resolveField(entry: unknown, spec: string | null): string | null {
  if (spec === null) return null;
  if (!spec.includes('{')) return readString(entry, spec);

  const rendered = spec
    .replace(/\{([^{}]+)\}/g, (_match, path: string) => readString(entry, path.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,;|/·-]+|[\s:,;|/·-]+$/g, '')
    .trim();
  return rendered === '' ? null : rendered;
}

/**
 * Dates that already sort (2026-09-13, 1833-01) are kept as written. Anything
 * else JavaScript can read, such as "Sat, 13 Sep 2026 09:30:00 GMT", becomes ISO,
 * because ranking sorts dates as text and a weekday name sorts nonsensically.
 */
export function normalizeDate(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}/.test(value)) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

/** The newest date across items, for a source that has no separate stats document. */
export function newestDate(items: readonly Item[]): string | null {
  let newest: string | null = null;
  for (const item of items) {
    if (item.date !== null && (newest === null || item.date > newest)) newest = item.date;
  }
  return newest;
}

/** Each guess with a sample value from the data, so a person can judge it. */
export function buildEvidence(fields: FieldMap, first: unknown): FieldEvidence[] {
  return (Object.keys(fields) as (keyof FieldMap)[]).map((field) => {
    const spec = fields[field];
    const value = resolveField(first, spec);
    return { field, path: spec, sample: value === null ? null : trimSample(value) };
  });
}

function readability(items: readonly unknown[]): number {
  const fields = inferFields(items);
  return (Object.keys(WEIGHT) as (keyof FieldMap)[]).reduce(
    (total, field) => (fields[field] === null ? total : total + WEIGHT[field]),
    0,
  );
}

/** The spelling of a candidate key this data uses, when most records have a value there. */
function matchKey(sample: readonly unknown[], candidate: string): string | null {
  if (usableOnMost(sample, candidate)) return candidate;
  if (candidate.includes('.')) return null;

  const first = sample.find(isPlainObject);
  const actual =
    first === undefined ? undefined : Object.keys(first).find((key) => key.toLowerCase() === candidate.toLowerCase());
  return actual !== undefined && actual !== candidate && usableOnMost(sample, actual) ? actual : null;
}

function usableOnMost(sample: readonly unknown[], path: string): boolean {
  if (sample.length === 0) return false;
  return sample.filter((item) => readString(item, path) !== null).length > sample.length / 2;
}

function trimSample(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
}
