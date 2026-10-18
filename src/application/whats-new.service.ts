import type { AppDefinition } from '../domain/app-definition.js';
import { StackVoiceError } from '../domain/errors.js';
import { SEARCH_LIMIT_MAX, type Item } from '../domain/item.js';
import type { SeenMark, SeenStore } from '../domain/ports/seen-store.js';
import type { AppRegistryService } from './app-registry.service.js';
import type { SearchService } from './search.service.js';

/** What one app has had since the owner last asked. */
export type WhatsNewEntry =
  /** Never asked before: from now on it is tracked. */
  | { readonly kind: 'first'; readonly appId: string; readonly label: string; readonly newest: Item }
  | {
      readonly kind: 'new';
      readonly appId: string;
      readonly label: string;
      /** Newest first. */
      readonly items: readonly Item[];
      /** Every entry looked at was new, so there may be more than were counted. */
      readonly atLeast: boolean;
      readonly since: string;
    }
  | { readonly kind: 'none'; readonly appId: string; readonly label: string; readonly since: string }
  /** No entry carries a date, so nothing can be called new. */
  | { readonly kind: 'undated'; readonly appId: string; readonly label: string }
  | { readonly kind: 'unavailable'; readonly appId: string; readonly label: string; readonly reason: string };

export interface WhatsNewReport {
  /** Null when every app was asked about. */
  readonly appId: string | null;
  readonly apps: readonly WhatsNewEntry[];
}

export interface WhatsNewDeps {
  readonly registry: AppRegistryService;
  readonly search: SearchService;
  readonly store: SeenStore;
  readonly now: () => Date;
  /**
   * Whether asking marks entries as told. The console's Try it runs real tools
   * but saves nothing, so it peeks without moving the mark.
   */
  readonly record: boolean;
}

/**
 * "What's new since I last asked?", across conversations and restarts.
 *
 * For each app it remembers the date of the newest entry already reported, and
 * counts the entries dated after it. Dates are compared as the source writes
 * them, which orders correctly for the ISO dates every reader produces.
 */
export class WhatsNewService {
  constructor(private readonly deps: WhatsNewDeps) {}

  /** @throws {AppNotFoundError} when `appId` names no enabled app. */
  async report(appId?: string): Promise<WhatsNewReport> {
    const apps = appId === undefined ? this.deps.registry.listEnabled() : [this.deps.registry.get(appId)];
    const marks = await this.deps.store.load();
    const now = this.deps.now().toISOString();

    const updates: Record<string, SeenMark> = {};
    const entries: WhatsNewEntry[] = [];
    for (const app of apps) {
      const { entry, mark } = await this.check(app, marks[app.id], now);
      entries.push(entry);
      if (mark !== null) updates[app.id] = mark;
    }

    if (this.deps.record && Object.keys(updates).length > 0) {
      await this.deps.store.save({ ...marks, ...updates });
    }
    return { appId: appId ?? null, apps: entries };
  }

  private async check(
    app: AppDefinition,
    mark: SeenMark | undefined,
    now: string,
  ): Promise<{ entry: WhatsNewEntry; mark: SeenMark | null }> {
    const base = { appId: app.id, label: app.label };

    let items: readonly Item[];
    try {
      // With no query the readers return the newest first.
      items = await this.deps.search.search(app.id, { limit: SEARCH_LIMIT_MAX });
    } catch (error) {
      // One app that cannot be reached must not hide what the others have.
      if (!(error instanceof StackVoiceError)) throw error;
      return { entry: { ...base, kind: 'unavailable', reason: error.message }, mark: null };
    }

    const dated = items
      .filter((item): item is Item & { date: string } => item.date !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
    const newest = dated[0];
    if (newest === undefined) return { entry: { ...base, kind: 'undated' }, mark: null };

    if (mark === undefined) {
      return { entry: { ...base, kind: 'first', newest }, mark: { seenUntil: newest.date, askedAt: now } };
    }

    const fresh = dated.filter((item) => item.date > mark.seenUntil);
    const seenUntil = newest.date > mark.seenUntil ? newest.date : mark.seenUntil;
    const next = { seenUntil, askedAt: now };
    if (fresh.length === 0) return { entry: { ...base, kind: 'none', since: mark.askedAt }, mark: next };

    return {
      entry: {
        ...base,
        kind: 'new',
        items: fresh,
        atLeast: fresh.length === items.length && items.length >= SEARCH_LIMIT_MAX,
        since: mark.askedAt,
      },
      mark: next,
    };
  }
}
