import { AppNotFoundError, ValidationError } from '../domain/errors.js';
import { SEARCH_LIMIT_DEFAULT } from '../domain/item.js';
import type { AppRegistryService } from './app-registry.service.js';
import type { HealthService } from './health.service.js';
import type { ReadService } from './read.service.js';
import { shapeAppHealth, shapeItem, shapeSearchResults, shapeStackHealth } from './response-shaper.js';
import type { SearchService } from './search.service.js';
import type { StatusService } from './status.service.js';

export interface ToolOutput {
  /** What the assistant says. Already shaped for speech. */
  readonly spoken: string;
  readonly structured: Record<string, unknown> | null;
}

export interface ToolRunnerDeps {
  readonly registry: AppRegistryService;
  readonly search: SearchService;
  readonly read: ReadService;
  readonly status: StatusService;
  readonly health: HealthService;
  readonly now: () => Date;
}

const GLOBAL_TOOL = 'stack_status';
const VERBS = ['search', 'read', 'status'] as const;
type Verb = (typeof VERBS)[number];

/**
 * Runs a generated tool by name.
 *
 * This used to live inside the MCP tool mapper, which was fine until shortcuts
 * needed to run the same tools. Two callers meant the dispatch belonged in the
 * application layer, where neither the MCP layer nor the shortcut layer owns it.
 */
export class ToolRunner {
  constructor(private readonly deps: ToolRunnerDeps) {}

  /**
   * @throws {ValidationError} when the tool name is not one this server generates.
   * @throws {AppNotFoundError} @throws {SourceUnavailableError}
   */
  async run(toolName: string, args: Readonly<Record<string, unknown>> = {}): Promise<ToolOutput> {
    if (toolName === GLOBAL_TOOL) {
      const health = await this.deps.health.reportStack();
      return { spoken: shapeStackHealth(health), structured: asRecord(health) };
    }

    const parsed = this.parse(toolName);
    switch (parsed.verb) {
      case 'search':
        return this.runSearch(parsed.appId, args);
      case 'read':
        return this.runRead(parsed.appId, args);
      case 'status':
        return this.runStatus(parsed.appId);
    }
  }

  private async runSearch(appId: string, args: Readonly<Record<string, unknown>>): Promise<ToolOutput> {
    const params = {
      query: text(args['query']),
      topic: text(args['topic']),
      region: text(args['region']),
      limit: typeof args['limit'] === 'number' ? args['limit'] : SEARCH_LIMIT_DEFAULT,
    };

    const items = await this.deps.search.search(appId, params);
    const label = this.deps.registry.get(appId).label;
    return {
      spoken: shapeSearchResults(label, items, params),
      structured: { items: [...items] },
    };
  }

  private async runRead(appId: string, args: Readonly<Record<string, unknown>>): Promise<ToolOutput> {
    const key = text(args['key']);
    const label = this.deps.registry.get(appId).label;
    if (key === undefined) {
      return { spoken: `Tell me which entry from your ${label} you mean.`, structured: { found: false, item: null } };
    }

    const item = await this.deps.read.read(appId, key);
    return {
      spoken: item === null ? `Your ${label} has no entry with that key.` : shapeItem(item),
      structured: { found: item !== null, item },
    };
  }

  private async runStatus(appId: string): Promise<ToolOutput> {
    const health = await this.deps.status.statusOf(appId);
    const label = this.deps.registry.get(appId).label;
    return {
      spoken: shapeAppHealth(label, health, this.deps.now()),
      structured: asRecord(health),
    };
  }

  /**
   * `library_search` splits at the last underscore, because app ids may contain
   * dashes but never underscores (CONFIGURATION.md §3).
   */
  private parse(toolName: string): { appId: string; verb: Verb } {
    const at = toolName.lastIndexOf('_');
    const appId = at === -1 ? '' : toolName.slice(0, at);
    const verb = at === -1 ? '' : toolName.slice(at + 1);

    if (appId === '' || !VERBS.includes(verb as Verb)) {
      throw new ValidationError(`"${toolName}" is not a tool this server exposes`, 'tool');
    }
    // Surfaces as AppNotFoundError when the app is gone or disabled.
    this.deps.registry.get(appId);
    return { appId, verb: verb as Verb };
  }
}

/** Re-thrown unchanged; named so the intent of the bare call above is clear. */
export { AppNotFoundError };

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
