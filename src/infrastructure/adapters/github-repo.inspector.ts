import { DEFAULT_STATUS_FIELD_MAP, type FieldMap, type StatusFieldMap } from '../../domain/data-source.js';
import { SourceUnavailableError } from '../../domain/errors.js';
import type { FieldEvidence, SourceProposal } from '../../domain/source-proposal.js';
import type { JsonFetcher } from '../http/http-client.js';
import { readNumber, readPath, readString } from './dot-path.js';

const RAW_BASE = 'https://raw.githubusercontent.com';

/** Where data projects usually publish their read models. */
const INDEX_CANDIDATES = [
  'data/views/index.json',
  'data/views/items.json',
  'data/index.json',
  'views/index.json',
  'docs/data/index.json',
  'index.json',
];

const STATS_CANDIDATES = [
  'data/views/stats.json',
  'data/views/status.json',
  'data/views/summary.json',
  'data/stats.json',
  'data/status.json',
];

/**
 * Candidate payload keys per normalized field, best first.
 *
 * These are the names data projects actually use. The list is ordered, not
 * scored: the first key that exists on the data wins, which keeps the guess
 * explainable — the user can see exactly why `tldr` was chosen as the summary.
 */
const CANDIDATES: Record<keyof FieldMap, readonly string[]> = {
  key: ['key', 'id', 'slug', 'uuid', 'guid', 'ref'],
  title: ['title', 'headline', 'name', 'subject', 'summary'],
  summary: ['tldr', 'summary', 'description', 'abstract', 'excerpt', 'blurb', 'snippet', 'body'],
  date: ['date', 'date_utc', 'published_at', 'published', 'created_at', 'updated_at', 'timestamp', 'dt'],
  topic: ['topic', 'category', 'collection', 'event_type', 'type', 'kind', 'section'],
  region: ['region', 'country', 'market', 'location', 'place'],
  url: ['url', 'source_url', 'link', 'permalink', 'href'],
};

const STATUS_DATE_CANDIDATES = ['last_date', 'updated_at', 'generated_at', 'last_run', 'date', 'timestamp'];
const STATUS_COUNT_CANDIDATES = [
  'total_items',
  'item_count',
  'count',
  'total',
  'stats.events',
  'stats.items',
  'stats.total',
];

/**
 * Looks at a public GitHub data project and proposes a source configuration.
 *
 * This exists because the config-driven claim is only true if configuring is
 * easy. Without it, adding an app means reading your own JSON by hand and
 * guessing which key the search tool should read. With it, adding an app is one
 * command and a glance at what was inferred.
 */
export class GithubRepoInspector {
  constructor(private readonly http: JsonFetcher) {}

  async inspect(repo: string, branch = 'main'): Promise<SourceProposal> {
    const tried: string[] = [];

    const index = await this.findFirst(repo, branch, INDEX_CANDIDATES, tried);
    if (index === null) {
      throw new SourceUnavailableError(
        repo,
        `no read model found. Looked for ${INDEX_CANDIDATES.join(', ')} on branch "${branch}"`,
      );
    }

    const located = locateItems(index.body);
    if (located === null) {
      throw new SourceUnavailableError(repo, `${index.path} holds no list of records`);
    }

    const first = located.items[0] as Record<string, unknown>;
    const inferred = inferFields(located.items);

    // Without something to say, there is nothing to read out. Refusing here
    // beats writing a config that validates and then answers with silence.
    const title = inferred.title ?? inferred.summary;
    if (title === null || title === undefined) {
      throw new SourceUnavailableError(
        repo,
        `${index.path} has records but none of them carry a title or summary. ` +
          `Keys seen: ${Object.keys(first).sort().join(', ')}. ` +
          `Point index_file at a different view, or add the app by hand.`,
      );
    }

    const fields: FieldMap = {
      key: inferred.key ?? title,
      title,
      summary: inferred.summary,
      date: inferred.date,
      topic: inferred.topic,
      region: inferred.region,
      url: inferred.url,
    };
    const evidence = buildEvidence(fields, first);

    const stats = await this.findStats(repo, branch, index, tried);

    return {
      repo,
      viewsDir: index.path.includes('/') ? index.path.slice(0, index.path.lastIndexOf('/')) : '.',
      indexFile: index.path,
      statsFile: stats.path,
      itemsPath: located.path,
      itemCount: located.items.length,
      fields,
      statusFields: stats.fields,
      suggestedPrimitives: {
        search: true,
        // No identifier means an entry cannot be fetched back on its own.
        read: inferred.key !== null,
        status: true,
      },
      evidence,
      availableKeys: Object.keys(first).sort(),
      triedPaths: tried,
    };
  }

  /**
   * Picks the document the status verb should read.
   *
   * Not simply the first stats file that exists: eventpulse publishes a
   * `status.json` with a timestamp but no counts, while its index document
   * carries both. Every candidate is scored on what it can actually answer, and
   * the index is a candidate too.
   */
  private async findStats(
    repo: string,
    branch: string,
    index: { path: string; body: unknown },
    tried: string[],
  ): Promise<{ path: string; fields: StatusFieldMap }> {
    const candidates: { path: string; body: unknown }[] = [];
    for (const path of STATS_CANDIDATES) {
      try {
        candidates.push({
          path,
          body: await this.http.getJson<unknown>(`${RAW_BASE}/${repo}/${branch}/${path}`, repo),
        });
      } catch {
        tried.push(path);
      }
    }
    candidates.push(index);

    let best: { path: string; fields: StatusFieldMap; score: number } | null = null;
    for (const candidate of candidates) {
      const date = STATUS_DATE_CANDIDATES.find((path) => readString(candidate.body, path) !== null);
      const count = STATUS_COUNT_CANDIDATES.find((path) => readNumber(candidate.body, path) !== null);
      const score = (date === undefined ? 0 : 1) + (count === undefined ? 0 : 2);

      if (best === null || score > best.score) {
        best = {
          path: candidate.path,
          score,
          fields: {
            lastDataDate: date ?? DEFAULT_STATUS_FIELD_MAP.lastDataDate,
            itemCount: count ?? DEFAULT_STATUS_FIELD_MAP.itemCount,
          },
        };
      }
    }

    return best as { path: string; fields: StatusFieldMap };
  }

  /** Returns the first candidate path that exists, recording the misses. */
  private async findFirst(
    repo: string,
    branch: string,
    candidates: readonly string[],
    tried: string[],
  ): Promise<{ path: string; body: unknown } | null> {
    for (const path of candidates) {
      try {
        const body = await this.http.getJson<unknown>(`${RAW_BASE}/${repo}/${branch}/${path}`, repo);
        return { path, body };
      } catch {
        tried.push(path);
      }
    }
    return null;
  }
}

/** How much a candidate array looks like something a person would want read out. */
const FIELD_WEIGHT: Record<keyof FieldMap, number> = {
  title: 4,
  summary: 3,
  date: 2,
  key: 2,
  topic: 1,
  region: 1,
  url: 1,
};

function readability(items: readonly unknown[]): number {
  const fields = inferFields(items);
  return (Object.keys(FIELD_WEIGHT) as (keyof FieldMap)[]).reduce(
    (total, field) => (fields[field] === null ? total : total + FIELD_WEIGHT[field]),
    0,
  );
}

/** Every field optional, because inference is allowed to come up empty. */
type InferredFields = { readonly [K in keyof FieldMap]: string | null };

/**
 * Finds the list of records to expose.
 *
 * Picking the longest array is wrong: eventpulse publishes 39 price rows next to
 * 10 readable events, and the price rows have no title, summary or date. What
 * matters is how much of a spoken answer an array can fill, so candidates are
 * scored on that and length only breaks a tie.
 */
function locateItems(document: unknown): { path: string | null; items: unknown[] } | null {
  if (isRecordArray(document)) return { path: null, items: document };
  if (document === null || typeof document !== 'object') return null;

  let best: { path: string; items: unknown[]; score: number } | null = null;
  for (const [key, value] of Object.entries(document as Record<string, unknown>)) {
    if (!isRecordArray(value)) continue;
    const score = readability(value);
    if (best === null || score > best.score || (score === best.score && value.length > best.items.length)) {
      best = { path: key, items: value, score };
    }
  }
  return best;
}

function isRecordArray(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    !Array.isArray(value[0])
  );
}

/**
 * Picks a payload key per field.
 *
 * A key only counts if it holds a usable value on most of the sample, so a
 * field that exists but is empty everywhere is not proposed.
 */
function inferFields(items: readonly unknown[]): InferredFields {
  const sample = items.slice(0, 10);
  const pick = (field: keyof FieldMap): string | null => {
    for (const candidate of CANDIDATES[field]) {
      const hits = sample.filter((item) => readString(item, candidate) !== null).length;
      if (hits > sample.length / 2) return candidate;
    }
    return null;
  };

  // Never invent a path that is not in the data: a config naming a field that
  // does not exist looks valid and then returns nothing at runtime.
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

function buildEvidence(fields: FieldMap, first: Record<string, unknown>): FieldEvidence[] {
  return (Object.keys(fields) as (keyof FieldMap)[]).map((field) => {
    const path = fields[field];
    const raw = path === null ? null : readPath(first, path);
    return {
      field,
      path,
      sample: raw === undefined || raw === null ? null : trim(String(raw)),
    };
  });
}

function trim(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
}
