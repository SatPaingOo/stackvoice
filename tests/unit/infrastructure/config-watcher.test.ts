import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Logger } from '../../../src/domain/ports/logger.js';
import { ConfigWatcher } from '../../../src/infrastructure/config/config-watcher.js';

/**
 * The watcher against a real folder. File events arrive when the operating
 * system delivers them, so each test waits for a reload rather than for a
 * fixed time.
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

let watcher: ConfigWatcher | null = null;

afterEach(() => {
  watcher?.stop();
  watcher = null;
});

async function watchedConfig(): Promise<{ root: string; reloads: () => number }> {
  const root = await mkdtemp(join(tmpdir(), 'stackvoice-watch-'));
  await mkdir(join(root, 'apps'));
  await writeFile(join(root, 'shortcuts.yml'), 'shortcuts: []\n', 'utf8');
  let count = 0;
  watcher = new ConfigWatcher({
    appsDir: join(root, 'apps'),
    shortcutsFile: join(root, 'shortcuts.yml'),
    logger: silentLogger,
    reload: async () => {
      count += 1;
    },
  });
  watcher.start();
  return { root, reloads: () => count };
}

async function waitFor(condition: () => boolean, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

describe('ConfigWatcher', () => {
  it('reloads when an app file changes', async () => {
    const { root, reloads } = await watchedConfig();

    await writeFile(join(root, 'apps', 'news.yml'), 'id: news\n', 'utf8');

    expect(await waitFor(() => reloads() > 0)).toBe(true);
  });

  it('reloads when shortcuts.yml is edited by hand', async () => {
    const { root, reloads } = await watchedConfig();

    await writeFile(join(root, 'shortcuts.yml'), 'shortcuts:\n  - name: news\n', 'utf8');

    expect(await waitFor(() => reloads() > 0)).toBe(true);
  });

  it('leaves other files in the config folder alone', async () => {
    const { root, reloads } = await watchedConfig();

    await writeFile(join(root, 'settings.yml'), 'server: {}\n', 'utf8');

    // Long enough for the debounce to have fired, had the change counted.
    expect(await waitFor(() => reloads() > 0, 1000)).toBe(false);
  });
});
