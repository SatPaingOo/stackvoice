import { watch, type FSWatcher } from 'node:fs';

import type { Logger } from '../../domain/ports/logger.js';

/** Editors write a file in several steps; wait for them to settle. */
const DEBOUNCE_MS = 300;

export interface ConfigWatcherOptions {
  readonly appsDir: string;
  readonly reload: () => Promise<void>;
  readonly logger: Logger;
}

/**
 * Reloads the app registry when `config/apps/` changes.
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
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: ConfigWatcherOptions) {}

  start(): void {
    if (this.watcher !== null) return;

    try {
      this.watcher = watch(this.options.appsDir, { persistent: false }, (_event, file) => {
        if (file !== null && !/\.(yml|yaml)$/.test(file)) return;
        this.schedule();
      });
      this.options.logger.info('watching config', { dir: this.options.appsDir });
    } catch (cause) {
      // Some filesystems cannot watch. Losing hot reload is not worth a crash.
      this.options.logger.warn('config watch unavailable', { reason: String(cause) });
    }
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
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
