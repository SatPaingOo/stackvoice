import type { AppDefinition } from '../app-definition.js';

/**
 * Abstracts where app definitions live. The domain never learns that apps are
 * YAML files in `config/apps/`.
 */
export interface ConfigStore {
  /** @throws {ConfigError} naming the offending file when any app fails to load. */
  listApps(): Promise<readonly AppDefinition[]>;

  /** The one app, or null when nothing is stored under that id. */
  getApp(id: string): Promise<AppDefinition | null>;

  /**
   * Writes an app, replacing any existing one with the same id.
   * Implementations back up what they overwrite and write atomically.
   *
   * @returns the path of the backup taken, or null when nothing was replaced.
   */
  saveApp(app: AppDefinition): Promise<string | null>;

  /** @returns the path of the backup taken. @throws {AppNotFoundError} */
  removeApp(id: string): Promise<string>;
}
