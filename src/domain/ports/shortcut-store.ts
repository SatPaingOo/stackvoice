import type { Shortcut } from '../shortcut.js';

/**
 * Where shortcuts live. Separate from `ConfigStore` because a shortcut spans
 * apps and belongs to none of them (Interface Segregation).
 */
export interface ShortcutStore {
  /** @throws {ConfigError} naming the file when the shortcuts fail to load. */
  list(): Promise<readonly Shortcut[]>;
  /** Replaces the whole set. Backs up what it overwrites. */
  save(shortcuts: readonly Shortcut[]): Promise<string | null>;
}
