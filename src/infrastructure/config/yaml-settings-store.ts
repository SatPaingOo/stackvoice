import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { ConfigError } from '../../domain/errors.js';
import type { SettingsStore } from '../../domain/ports/settings-store.js';
import type { Settings } from '../../domain/settings.js';
import { settingsSchema } from './settings.schema.js';

/**
 * Reads `config/settings.yml`. Fails fast and names the offending field, so a
 * broken config can never half-boot a server that silently exposes nothing.
 */
export class YamlSettingsStore implements SettingsStore {
  constructor(
    private readonly filePath: string,
    private readonly backupsDir: string = join(dirname(filePath), 'backups'),
  ) {}

  async load(): Promise<Settings> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (cause) {
      throw new ConfigError('Could not read settings file', this.filePath, { cause });
    }

    let document: unknown;
    try {
      document = parseYaml(text);
    } catch (cause) {
      throw new ConfigError('Settings file is not valid YAML', this.filePath, { cause });
    }

    const parsed = settingsSchema.safeParse(document ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path.join('.') || '(root)';
      throw new ConfigError(`Invalid settings at "${field}": ${first?.message ?? 'unknown'}`, this.filePath);
    }

    const raw = parsed.data;
    return {
      server: {
        host: raw.server.host,
        port: raw.server.port,
        logLevel: raw.server.log_level,
      },
      management: {
        cli: raw.management.cli,
      },
      auth: {
        mode: raw.auth.mode,
        token: raw.auth.token,
        publicUrl: raw.auth.public_url.replace(/\/+$/, ''),
      },
      console: {
        enabled: raw.console.enabled,
      },
      simulator: {
        enabled: raw.simulator.enabled,
      },
      cache: {
        ttlSeconds: raw.cache.ttl_seconds,
      },
    };
  }

  /** Canonical YAML, written atomically, with the previous file kept. */
  async save(settings: Settings): Promise<string | null> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = join(this.backupsDir, `settings.yml.${stamp}`);

    let backup: string | null = null;
    try {
      await mkdir(this.backupsDir, { recursive: true });
      await copyFile(this.filePath, target);
      backup = target;
    } catch {
      backup = null;
    }

    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, render(settings), 'utf8');
    await rename(temporary, this.filePath);
    return backup;
  }
}

function render(settings: Settings): string {
  return [
    '# StackVoice — server & management settings.',
    '# See CONFIGURATION.md §2 for the full reference.',
    '',
    'server:',
    `  host: ${settings.server.host}          # 127.0.0.1 keeps it local; 0.0.0.0 behind a tunnel`,
    `  port: ${String(settings.server.port)}`,
    `  log_level: ${settings.server.logLevel}          # debug | info | warn | error`,
    '',
    'auth:',
    '  # none  — localhost development only',
    '  # token — one shared bearer token, enough for a private tunnel',
    '  # oauth — OAuth 2.1 with PKCE, which Alexa+ requires',
    `  mode: ${settings.auth.mode}`,
    `  token: ${JSON.stringify(settings.auth.token)}`,
    `  public_url: ${JSON.stringify(settings.auth.publicUrl)}`,
    '',
    'console:',
    `  enabled: ${String(settings.console.enabled)}            # web console at /console`,
    '',
    'simulator:',
    `  enabled: ${String(settings.simulator.enabled)}            # simulated Alexa+ page at /simulator`,
    '',
    'management:',
    `  cli: ${String(settings.management.cli)}`,
    '',
    'cache:',
    `  ttl_seconds: ${String(settings.cache.ttlSeconds)}         # per-URL cache for fetched JSON`,
    '',
  ].join('\n');
}
