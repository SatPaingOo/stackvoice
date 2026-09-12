import { readFile } from 'node:fs/promises';
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
  constructor(private readonly filePath: string) {}

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
      cache: {
        ttlSeconds: raw.cache.ttl_seconds,
      },
    };
  }
}
