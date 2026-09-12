import type { Settings } from '../settings.js';

/**
 * Reads server settings from wherever they live. The core does not know that
 * settings are YAML on a filesystem.
 */
export interface SettingsStore {
  /** @throws {ConfigError} when the settings source is missing or invalid. */
  load(): Promise<Settings>;

  /**
   * Writes settings back, backing up what it replaces.
   *
   * Some of these only take effect on the next start — the bound port, the auth
   * mode, which faces are mounted — so callers are expected to say so rather
   * than pretend the change is live.
   *
   * @returns the backup path, or null when there was nothing to back up.
   */
  save(settings: Settings): Promise<string | null>;
}
