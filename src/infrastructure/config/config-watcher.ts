import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { Logger } from '../../domain/ports/logger.js';

/** Editors write a file in several steps; wait for them to settle. */
const DEBOUNCE_MS = 300;

export interface ConfigWatcherOptions {
  readonly appsDir: string;
  /** `config/shortcuts.yml`, which sits beside the apps folder rather than in it. */
  readonly shortcutsFile: string;
  readonly reload: () => Promise<void>;
  readonly logger: Logger;
}

/**
 * Reloads the app and shortcut registries when `config/apps/` or
 * `config/shortcuts.yml` changes.
 *
 * Without this, "drop a file in and new tools appear" means "drop a file in and
 * restart the server", which is a worse story and a worse demo. Each MCP
 * session builds its tool list from the registry when it connects, so a reload
 * is enough: the next conversation sees the new tools.
 *
 * A failed reload is logged and discarded. A running server keeps serving the
 * config it already validated rather than going dark because a file was
 * half-written.
 */
export class ConfigWatcher {
  private readonly watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: ConfigWatcherOptions) {}

  start(): void {
    if (this.watchers.length > 0) return;

    this.watch(this.options.appsDir, (file) => /\.(yml|yaml)$/.test(file));
    // Watched through its folder: a save writes a temporary file and renames it
    // over this one, and a watch on the file itself would end at the first save.
    // Everything else in config/, such as settings.yml, is left alone.
    const shortcutsName = basename(this.options.shortcutsFile);
    this.watch(dirname(this.options.shortcutsFile), (file) => file === shortcutsName);
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const watcher of this.watchers.splice(0)) watcher.close();
  }

  /** A platform that reports no file name gets a reload for every change in the folder. */
  private watch(dir: string, relevant: (file: string) => boolean): void {
    try {
      this.watchers.push(
        watch(dir, { persistent: false }, (_event, file) => {
          if (file !== null && !relevant(file)) return;
          this.schedule();
        }),
      );
      this.options.logger.info('watching config', { dir });
    } catch (cause) {
      // Some filesystems cannot watch. Losing hot reload is not worth a crash.
      this.options.logger.warn('config watch unavailable', { dir, reason: String(cause) });
    }
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.options
        .reload()
        .then(() => this.options.logger.info('config reloaded'))
        .catch((error: unknown) => {
          this.options.logger.warn('config reload failed, keeping the previous config', {
            reason: error instanceof Error ? error.message : String(error),
          });
        });
    }, DEBOUNCE_MS);
  }
}
