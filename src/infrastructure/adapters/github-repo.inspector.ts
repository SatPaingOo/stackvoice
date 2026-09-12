import { DEFAULT_STATUS_FIELD_MAP, type FieldMap, type StatusFieldMap } from '../../domain/data-source.js';
import { SourceUnavailableError, ValidationError } from '../../domain/errors.js';
import type { SourceInspector, SourceTarget } from '../../domain/ports/source-inspector.js';
import type { SourceProposal } from '../../domain/source-proposal.js';
import type { JsonFetcher } from '../http/http-client.js';
import { readNumber, readString } from './dot-path.js';
import { buildEvidence, fallbackTitle, inferFields, locateItems } from './records.js';

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
 * Guessing which field is which is shared with every other source type. What is
 * GitHub-specific is where to look: the usual read-model paths, and a stats
 * document the status verb can read freshness and counts from.
 */
export class GithubRepoInspector implements SourceInspector {
  constructor(private readonly http: JsonFetcher) {}

  async inspect(target: SourceTarget): Promise<SourceProposal> {
    if (target.type !== 'github-repo') {
      throw new ValidationError(`a ${target.type} source is not a GitHub repository`, 'type');
    }

    const { repo } = target;
    const branch = target.branch ?? 'main';
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

    // Something to say, in order of preference: a title, a summary, whatever columns hold text.
    const title = inferred.title ?? inferred.summary ?? fallbackTitle(located.items);
    if (title === null) {
      throw new SourceUnavailableError(
        repo,
        `${index.path} has records but nothing in them can be read out. ` +
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

    const stats = await this.findStats(repo, branch, index, tried);

    return {
      location: {
        type: 'github-repo',
        repo,
        branch,
        viewsDir: index.path.includes('/') ? index.path.slice(0, index.path.lastIndexOf('/')) : '.',
        indexFile: index.path,
        statsFile: stats.path,
      },
      suggestedLabel: null,
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
      evidence: buildEvidence(fields, first),
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
