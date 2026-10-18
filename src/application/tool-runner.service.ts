import { AppNotFoundError, ValidationError } from '../domain/errors.js';
import { SEARCH_LIMIT_DEFAULT } from '../domain/item.js';
import type { AppRegistryService } from './app-registry.service.js';
import type { HealthService } from './health.service.js';
import type { ReadService } from './read.service.js';
import { shapeAppHealth, shapeItem, shapeSearchResults, shapeStackHealth, shapeWhatsNew } from './response-shaper.js';
import type { SearchService } from './search.service.js';
import type { StatusService } from './status.service.js';
import type { WhatsNewService } from './whats-new.service.js';

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
  readonly whatsNew: WhatsNewService;
  readonly now: () => Date;
}

const GLOBAL_TOOL = 'stack_status';
const WHATS_NEW_TOOL = 'whats_new';
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
    if (toolName === WHATS_NEW_TOOL) {
      return this.runWhatsNew(args);
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
      structured: { items: [...items], app: { id: appId, label } },
    };
  }

  private async runWhatsNew(args: Readonly<Record<string, unknown>>): Promise<ToolOutput> {
    const report = await this.deps.whatsNew.report(text(args['app']));
    const only = report.apps.length === 1 ? report.apps[0] : undefined;
    // About one app, the new entries come back as items, so "tell me more" can follow the newest.
    const items = only?.kind === 'new' ? only.items : only?.kind === 'first' ? [only.newest] : [];
    return {
      spoken: shapeWhatsNew(report, this.deps.now()),
      structured: { ...asRecord(report), items: [...items] },
    };
  }

  private async runRead(appId: string, args: Readonly<Record<string, unknown>>): Promise<ToolOutput> {
    const key = text(args['key']);
    const label = this.deps.registry.get(appId).label;
    const app = { id: appId, label };
    if (key === undefined) {
      return {
        spoken: `Tell me which entry from your ${label} you mean.`,
        structured: { found: false, item: null, app },
      };
    }

    const item = await this.deps.read.read(appId, key);
    return {
      spoken: item === null ? `Your ${label} has no entry with that key.` : shapeItem(item),
      structured: { found: item !== null, item, app },
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
