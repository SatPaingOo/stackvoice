import type { Logger } from '../domain/ports/logger.js';
import type { ShortcutStore } from '../domain/ports/shortcut-store.js';
import type { Shortcut } from '../domain/shortcut.js';

/**
 * Holds the configured shortcuts in memory.
 *
 * Separate from `AppRegistryService` for the same reason the stores are
 * separate: a shortcut belongs to the stack, not to an app, and neither loader
 * should have a reason to change when the other does.
 */
export class ShortcutRegistryService {
  private shortcuts: readonly Shortcut[] = [];

  constructor(
    private readonly store: ShortcutStore,
    private readonly logger: Logger,
  ) {}

  /** @throws {ConfigError} naming the file; the server must not boot past this. */
  async load(): Promise<void> {
    this.shortcuts = await this.store.list();
    if (this.shortcuts.length > 0) {
      this.logger.info('shortcuts loaded', {
        count: this.shortcuts.length,
        tools: this.listEnabled().map((shortcut) => shortcut.toolName),
      });
    }
  }

  list(): readonly Shortcut[] {
    return this.shortcuts;
  }

  listEnabled(): readonly Shortcut[] {
    return this.shortcuts.filter((shortcut) => shortcut.enabled);
  }

  /** Null when nothing is configured under that tool name. */
  byToolName(toolName: string): Shortcut | null {
    return this.shortcuts.find((shortcut) => shortcut.toolName === toolName) ?? null;
  }
}
