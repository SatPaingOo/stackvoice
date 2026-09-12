import type { AppDefinition } from '../app-definition.js';

/**
 * Abstracts where app definitions live. The domain never learns that apps are
 * YAML files in `config/apps/`.
 */
export interface ConfigStore {
  /** @throws {ConfigError} naming the offending file when any app fails to load. */
  listApps(): Promise<readonly AppDefinition[]>;
}
