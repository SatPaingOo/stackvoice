import type { Settings } from '../settings.js';

/**
 * Reads server settings from wherever they live. The core does not know that
 * settings are YAML on a filesystem.
 */
export interface SettingsStore {
  /** @throws {ConfigError} when the settings source is missing or invalid. */
  load(): Promise<Settings>;
}
