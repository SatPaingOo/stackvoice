import { AppDefinition, APP_ID_PATTERN, type Primitives } from '../domain/app-definition.js';
import { DataSource, type FieldMap, type SourceLocation, type StatusFieldMap } from '../domain/data-source.js';
import { AppNotFoundError, ValidationError } from '../domain/errors.js';
import type { ConfigStore } from '../domain/ports/config-store.js';
import type { Logger } from '../domain/ports/logger.js';
import type { ShortcutStore } from '../domain/ports/shortcut-store.js';
import type { SourceInspector, SourceTarget } from '../domain/ports/source-inspector.js';
import { Shortcut, type ShortcutProps } from '../domain/shortcut.js';
import type { SourceProposal } from '../domain/source-proposal.js';
import { parseSourceInput } from './source-input.js';

export interface AddAppRequest {
  readonly id: string;
  readonly repo: string;
  readonly branch?: string | undefined;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  /** Overrides the inferred verbs. By default every verb the data supports is on. */
  readonly primitives?: Primitives | undefined;
}

/** Adding an app from whatever a person pasted into one box. */
export interface AddSourceRequest {
  readonly id: string;
  /** A link, a GitHub owner/repo, or a file path inside the data directory. */
  readonly input: string;
  /** For a link that needs a key. Values should reference secrets, never hold them. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly branch?: string | undefined;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  readonly primitives?: Primitives | undefined;
}

export interface AddAppResult {
  readonly app: AppDefinition;
  readonly proposal: SourceProposal;
  readonly backupPath: string | null;
  readonly replaced: boolean;
}

/**
 * A fully specified app, as a person edits it.
 *
 * `addFromRepo` is the fast path; this is the one behind every field the web
 * console exposes, so a guess the inspector got wrong is something the user
 * corrects rather than lives with.
 */
export interface AppSpec {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly primitives: Primitives;
  /** Where the data comes from, in the same shape a source keeps it. */
  readonly location: SourceLocation;
  readonly itemsPath: string | null;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
}

export interface ValidationReport {
  readonly appId: string;
  readonly ok: boolean;
  readonly problem: string | null;
}

/**
 * Every change to the app registry goes through here.
 *
 * The safety rules live in the service rather than in the CLI, so a second face
 * cannot forget one: nothing is written before it validates, whatever is
 * replaced is backed up first, and removal is explicit.
 */
export class ManagementService {
  constructor(
    private readonly store: ConfigStore,
    private readonly inspector: SourceInspector,
    private readonly logger: Logger,
    private readonly shortcuts: ShortcutStore,
  ) {}

  async list(): Promise<readonly AppDefinition[]> {
    return this.store.listApps();
  }

  /** @throws {AppNotFoundError} */
  async show(id: string): Promise<AppDefinition> {
    const app = await this.store.getApp(id);
    if (app === null) throw new AppNotFoundError(id);
    return app;
  }

  /**
   * Loads every app, or one, reporting what fails instead of throwing.
   *
   * This is the command that exists so a broken file is found before a restart
   * rather than by a server that refuses to boot.
   */
  async validate(id?: string): Promise<readonly ValidationReport[]> {
    if (id !== undefined) {
      try {
        await this.show(id);
        return [{ appId: id, ok: true, problem: null }];
      } catch (error) {
        return [{ appId: id, ok: false, problem: messageOf(error) }];
      }
    }

    try {
      const apps = await this.store.listApps();
      return apps.map((app) => ({ appId: app.id, ok: true, problem: null }));
    } catch (error) {
      return [{ appId: '(all)', ok: false, problem: messageOf(error) }];
    }
  }

  /**
   * Inspects a repository, proposes a mapping and writes the app.
   *
   * The inspection is what makes this worth having: it means adding an app is
   * one command and a glance at what was inferred, rather than reading your own
   * JSON and hand-authoring a field map.
   */
  async addFromSource(request: AddSourceRequest): Promise<AddAppResult> {
    assertAppId(request.id);
    const target = withBranch(parseSourceInput(request.input, request.headers ?? {}), request.branch);
    return this.addFromTarget(request, target);
  }

  /** The CLI's `--repo` flag, and every caller written before sources went beyond GitHub. */
  async addFromRepo(request: AddAppRequest): Promise<AddAppResult> {
    assertAppId(request.id);
    return this.addFromTarget(request, { type: 'github-repo', repo: request.repo, branch: request.branch });
  }

  private async addFromTarget(
    request: {
      readonly id: string;
      readonly label?: string | undefined;
      readonly description?: string | undefined;
      readonly primitives?: Primitives | undefined;
    },
    target: SourceTarget,
  ): Promise<AddAppResult> {
    const proposal = await this.inspector.inspect(target);
    const label = request.label ?? proposal.suggestedLabel ?? defaultLabel(target);

    const source = new DataSource({
      id: request.id,
      label: label.toLowerCase(),
      itemsPath: proposal.itemsPath,
      fields: proposal.fields,
      statusFields: proposal.statusFields,
      ...proposal.location,
    });

    const app = new AppDefinition({
      id: request.id,
      label,
      description:
        request.description ??
        `Records from ${source.describe()}. Edit this description: the assistant reads it to decide when to use this app.`,
      enabled: true,
      primitives: request.primitives ?? proposal.suggestedPrimitives,
      sources: [source],
    });

    const existing = await this.store.getApp(request.id);
    const backupPath = await this.store.saveApp(app);

    this.logger.info('app added', {
      appId: app.id,
      type: source.type,
      from: source.describe(),
      replaced: existing !== null,
    });
    return { app, proposal, backupPath, replaced: existing !== null };
  }

  /**
   * Writes an app exactly as specified, creating or replacing it.
   *
   * @throws {ValidationError} when the id or the source would be invalid.
   */
  async upsert(spec: AppSpec): Promise<{ app: AppDefinition; backupPath: string | null; replaced: boolean }> {
    if (!APP_ID_PATTERN.test(spec.id)) {
      throw new ValidationError(
        `"${spec.id}" must be lowercase, start with a letter, and be 2-32 characters of a-z, 0-9 or "-"`,
        'id',
      );
    }
    if (spec.label.trim() === '') throw new ValidationError('a label is required', 'label');
    if (spec.description.trim() === '') throw new ValidationError('a description is required', 'description');

    const app = new AppDefinition({
      id: spec.id,
      label: spec.label.trim(),
      description: spec.description.trim(),
      enabled: spec.enabled,
      primitives: spec.primitives,
      sources: [
        new DataSource({
          id: spec.id,
          label: spec.label.trim().toLowerCase(),
          itemsPath: spec.itemsPath,
          fields: spec.fields,
          statusFields: spec.statusFields,
          ...spec.location,
        }),
      ],
    });

    const existing = await this.store.getApp(spec.id);
    const backupPath = await this.store.saveApp(app);

    this.logger.info('app saved', { appId: app.id, replaced: existing !== null });
    return { app, backupPath, replaced: existing !== null };
  }

  /**
   * Inspects whatever was pasted, without writing anything. The console previews
   * with this before a person decides to save.
   */
  async inspect(
    input: string,
    options: { branch?: string | undefined; headers?: Readonly<Record<string, string>> | undefined } = {},
  ): Promise<SourceProposal> {
    return this.inspector.inspect(withBranch(parseSourceInput(input, options.headers ?? {}), options.branch));
  }

  /** @throws {AppNotFoundError} */
  async setEnabled(id: string, enabled: boolean): Promise<AppDefinition> {
    const current = await this.show(id);
    const updated = new AppDefinition({
      id: current.id,
      label: current.label,
      description: current.description,
      enabled,
      primitives: current.primitives,
      sources: current.sources,
    });

    await this.store.saveApp(updated);
    this.logger.info('app enabled state changed', { appId: id, enabled });
    return updated;
  }

  async listShortcuts(): Promise<readonly Shortcut[]> {
    return this.shortcuts.list();
  }

  /**
   * Creates or replaces one shortcut, matched by the tool name it produces.
   *
   * Renaming "morning brief" to "morning briefing" keeps the same tool name and
   * so replaces it, which is what a person editing a shortcut means.
   *
   * @throws {ValidationError} when the shortcut or one of its steps is invalid.
   */
  async saveShortcut(props: ShortcutProps, replacing?: string): Promise<Shortcut> {
    const shortcut = new Shortcut(props);
    const target = replacing === undefined ? shortcut.toolName : Shortcut.toolNameFor(replacing);

    const existing = await this.shortcuts.list();
    const kept = existing.filter((candidate) => candidate.toolName !== target);
    if (kept.some((candidate) => candidate.toolName === shortcut.toolName)) {
      throw new ValidationError(`another shortcut already becomes the tool "${shortcut.toolName}"`, 'name');
    }

    await this.shortcuts.save([...kept, shortcut]);
    this.logger.info('shortcut saved', { tool: shortcut.toolName, replaced: kept.length !== existing.length });
    return shortcut;
  }

  /** @throws {ValidationError} when no shortcut has that name. */
  async removeShortcut(name: string): Promise<void> {
    const target = Shortcut.toolNameFor(name);
    const existing = await this.shortcuts.list();
    const kept = existing.filter((candidate) => candidate.toolName !== target);

    if (kept.length === existing.length) {
      throw new ValidationError(`no shortcut called "${name}"`, 'name');
    }

    await this.shortcuts.save(kept);
    this.logger.info('shortcut removed', { tool: target });
  }

  /** @throws {AppNotFoundError} */
  async remove(id: string): Promise<string> {
    await this.show(id);
    const backup = await this.store.removeApp(id);
    this.logger.info('app removed', { appId: id, backup });
    return backup;
  }
}

function assertAppId(id: string): void {
  if (!APP_ID_PATTERN.test(id)) {
    throw new ValidationError(
      `"${id}" must be lowercase, start with a letter, and be 2-32 characters of a-z, 0-9 or "-"`,
      'id',
    );
  }
}

/**
 * A readable name from where the data lives, for when the data does not name
 * itself: "SatPaingOo/information-hub" becomes "Information hub".
 */
function defaultLabel(target: SourceTarget): string {
  let raw: string;
  switch (target.type) {
    case 'github-repo':
      raw = target.repo.slice(target.repo.indexOf('/') + 1);
      break;
    case 'url': {
      const url = new URL(target.url);
      const last = url.pathname
        .split('/')
        .filter((part) => part !== '')
        .pop();
      raw = last === undefined ? url.hostname.replace(/^www\./, '') : last.replace(/\.[a-z0-9]+$/i, '');
      break;
    }
    case 'file':
      raw = (target.path.split('/').pop() ?? target.path).replace(/\.[a-z0-9]+$/i, '');
      break;
  }
  const name = raw.replace(/[-_.]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function withBranch(target: SourceTarget, branch: string | undefined): SourceTarget {
  return target.type === 'github-repo' && branch !== undefined && branch !== '' ? { ...target, branch } : target;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
