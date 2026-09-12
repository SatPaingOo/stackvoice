import type { DataSource, GithubLocation } from '../../domain/data-source.js';
import { SourceUnavailableError, ValidationError } from '../../domain/errors.js';
import type { SourceHealth } from '../../domain/health.js';
import type { Item, SearchParams } from '../../domain/item.js';
import type { DataSourceReader } from '../../domain/ports/data-source-reader.js';
import { rankItems } from '../../domain/ranking.js';
import type { JsonFetcher } from '../http/http-client.js';
import { readNumber, readPath, readString } from './dot-path.js';
import { toItem } from './records.js';

const RAW_BASE = 'https://raw.githubusercontent.com';
const API_BASE = 'https://api.github.com';

interface WorkflowRun {
  readonly status?: string;
  readonly conclusion?: string | null;
  readonly run_started_at?: string;
  readonly updated_at?: string;
}

/**
 * Reads a data project published as JSON read models in a public GitHub repo:
 * `raw.githubusercontent.com` for the views, the Actions API for run health.
 *
 * The adapter knows about GitHub; nothing above it does. Reading a record goes
 * through the shared records module, so a template title or an odd date works
 * here exactly as it does for any other source.
 */
export class GithubRepoAdapter implements DataSourceReader {
  constructor(private readonly http: JsonFetcher) {}

  async search(source: DataSource, params: SearchParams): Promise<readonly Item[]> {
    const items = await this.loadItems(source);
    return rankItems(items, params).slice(0, params.limit);
  }

  async read(source: DataSource, key: string): Promise<Item | null> {
    const items = await this.loadItems(source);
    const wanted = key.trim().toLowerCase();
    return items.find((item) => item.key.toLowerCase() === wanted) ?? null;
  }

  async status(source: DataSource): Promise<SourceHealth> {
    const started = Date.now();
    const location = githubLocation(source);
    try {
      const [stats, run] = await Promise.all([
        this.http.getJson<unknown>(rawUrl(location, location.statsFile), source.id),
        this.latestRun(location, source.id),
      ]);

      const conclusion = run?.conclusion ?? null;
      return {
        sourceId: source.id,
        ok: conclusion === null || conclusion === 'success',
        lastRunAt: run?.updated_at ?? run?.run_started_at ?? null,
        lastDataDate: readString(stats, source.statusFields.lastDataDate),
        itemCount: readNumber(stats, source.statusFields.itemCount),
        latencyMs: Date.now() - started,
        lastError: conclusion !== null && conclusion !== 'success' ? `last run ${conclusion}` : null,
      };
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        return {
          sourceId: source.id,
          ok: false,
          lastRunAt: null,
          lastDataDate: null,
          itemCount: null,
          latencyMs: Date.now() - started,
          lastError: error.message,
        };
      }
      throw error;
    }
  }

  /** Fetches the index document and normalizes it through the source's field map. */
  private async loadItems(source: DataSource): Promise<readonly Item[]> {
    const location = githubLocation(source);
    const document = await this.http.getJson<unknown>(rawUrl(location, location.indexFile), source.id);
    const raw = source.itemsPath === null ? document : readPath(document, source.itemsPath);

    if (!Array.isArray(raw)) {
      const where = source.itemsPath === null ? location.indexFile : `${location.indexFile}#${source.itemsPath}`;
      throw new SourceUnavailableError(source.id, `${where} is not a list of items`);
    }

    return raw.map((entry) => toItem(entry, source.fields)).filter((item): item is Item => item !== null);
  }

  private async latestRun(location: GithubLocation, sourceId: string): Promise<WorkflowRun | null> {
    const url = `${API_BASE}/repos/${location.repo}/actions/runs?per_page=1`;
    const body = await this.http.getJson<{ workflow_runs?: WorkflowRun[] }>(url, sourceId);
    return body.workflow_runs?.[0] ?? null;
  }
}

function githubLocation(source: DataSource): GithubLocation {
  if (source.location.type !== 'github-repo') {
    throw new ValidationError(
      `${source.id} is a ${source.location.type} source, which the GitHub adapter does not handle`,
      `sources.${source.id}.type`,
    );
  }
  return source.location;
}

function rawUrl(location: GithubLocation, path: string): string {
  return `${RAW_BASE}/${location.repo}/${location.branch}/${path.replace(/^\/+/, '')}`;
}
