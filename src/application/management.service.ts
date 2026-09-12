import { AppDefinition, APP_ID_PATTERN, type Primitives } from '../domain/app-definition.js';
import { DataSource } from '../domain/data-source.js';
import { AppNotFoundError, ValidationError } from '../domain/errors.js';
import type { ConfigStore } from '../domain/ports/config-store.js';
import type { Logger } from '../domain/ports/logger.js';
import type { SourceInspector } from '../domain/ports/source-inspector.js';
import type { SourceProposal } from '../domain/source-proposal.js';

export interface AddAppRequest {
  readonly id: string;
  readonly repo: string;
  readonly branch?: string | undefined;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  /** Overrides the inferred verbs. By default every verb the data supports is on. */
  readonly primitives?: Primitives | undefined;
}

export interface AddAppResult {
  readonly app: AppDefinition;
  readonly proposal: SourceProposal;
  readonly backupPath: string | null;
  readonly replaced: boolean;
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
  async addFromRepo(request: AddAppRequest): Promise<AddAppResult> {
    if (!APP_ID_PATTERN.test(request.id)) {
      throw new ValidationError(
        `"${request.id}" must be lowercase, start with a letter, and be 2-32 characters of a-z, 0-9 or "-"`,
        'id',
      );
    }

    const proposal = await this.inspector.inspect(request.repo, request.branch);
    const label = request.label ?? defaultLabel(request.repo);

    const source = new DataSource({
      id: request.id,
      type: 'github-repo',
      label: label.toLowerCase(),
      repo: request.repo,
      viewsDir: proposal.viewsDir,
      statsFile: proposal.statsFile ?? proposal.indexFile,
      indexFile: proposal.indexFile,
      itemsPath: proposal.itemsPath,
      fields: proposal.fields,
      statusFields: proposal.statusFields,
    });

    const app = new AppDefinition({
      id: request.id,
      label,
      description:
        request.description ??
        `Records published by ${request.repo}. Edit this description: the assistant reads it to decide when to use this app.`,
      enabled: true,
      primitives: request.primitives ?? proposal.suggestedPrimitives,
      sources: [source],
    });

    const existing = await this.store.getApp(request.id);
    const backupPath = await this.store.saveApp(app);

    this.logger.info('app added', { appId: app.id, repo: request.repo, replaced: existing !== null });
    return { app, proposal, backupPath, replaced: existing !== null };
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

  /** @throws {AppNotFoundError} */
  async remove(id: string): Promise<string> {
    await this.show(id);
    const backup = await this.store.removeApp(id);
    this.logger.info('app removed', { appId: id, backup });
    return backup;
  }
}

/** "SatPaingOo/information-hub" becomes "Information hub". */
function defaultLabel(repo: string): string {
  const name = repo.slice(repo.indexOf('/') + 1).replace(/[-_]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
