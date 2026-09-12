import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { AppDefinition } from '../../domain/app-definition.js';
import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
} from '../../domain/data-source.js';
import { ConfigError, StackVoiceError } from '../../domain/errors.js';
import type { ConfigStore } from '../../domain/ports/config-store.js';
import { appSchema, type RawApp } from './app.schema.js';

/**
 * Loads every `config/apps/*.yml` into validated `AppDefinition`s.
 *
 * Fail-fast by design: one broken file stops the boot and names the file and
 * field, because a server that half-exposes tools is worse than one that
 * refuses to start.
 */
export class YamlConfigStore implements ConfigStore {
  constructor(private readonly appsDir: string) {}

  async listApps(): Promise<readonly AppDefinition[]> {
    let entries: string[];
    try {
      entries = await readdir(this.appsDir);
    } catch (cause) {
      throw new ConfigError('Could not read the apps directory', this.appsDir, { cause });
    }

    const files = entries.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml')).sort();
    const apps: AppDefinition[] = [];
    const seen = new Set<string>();

    for (const file of files) {
      const path = join(this.appsDir, file);
      const app = await this.loadOne(path);

      const expectedId = basename(file).replace(/\.(yml|yaml)$/, '');
      if (app.id !== expectedId) {
        throw new ConfigError(`App id "${app.id}" does not match the filename`, path);
      }
      if (seen.has(app.id)) {
        throw new ConfigError(`Duplicate app id "${app.id}"`, path);
      }
      seen.add(app.id);
      apps.push(app);
    }

    return apps;
  }

  private async loadOne(path: string): Promise<AppDefinition> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (cause) {
      throw new ConfigError('Could not read app file', path, { cause });
    }

    let document: unknown;
    try {
      document = parseYaml(text);
    } catch (cause) {
      throw new ConfigError('App file is not valid YAML', path, { cause });
    }

    const parsed = appSchema.safeParse(document);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path.join('.') || '(root)';
      throw new ConfigError(`Invalid app at "${field}": ${first?.message ?? 'unknown'}`, path);
    }

    try {
      return toDefinition(parsed.data);
    } catch (cause) {
      if (cause instanceof StackVoiceError) throw new ConfigError(cause.message, path, { cause });
      throw cause;
    }
  }
}

function toDefinition(raw: RawApp): AppDefinition {
  const sources = raw.sources.map(
    (source) =>
      new DataSource({
        id: source.id,
        type: source.type,
        label: source.label,
        repo: source.repo,
        viewsDir: source.views_dir,
        statsFile: source.stats_file,
        indexFile: source.index_file ?? `${source.views_dir}/index.json`,
        itemsPath: source.items_path,
        fields: {
          key: source.fields.key || DEFAULT_FIELD_MAP.key,
          title: source.fields.title || DEFAULT_FIELD_MAP.title,
          summary: source.fields.summary,
          date: source.fields.date,
          topic: source.fields.topic,
          region: source.fields.region,
          url: source.fields.url,
        },
        statusFields: {
          lastDataDate: source.status_fields.last_data_date || DEFAULT_STATUS_FIELD_MAP.lastDataDate,
          itemCount: source.status_fields.item_count || DEFAULT_STATUS_FIELD_MAP.itemCount,
        },
      }),
  );

  return new AppDefinition({
    id: raw.id,
    label: raw.label,
    description: raw.description.trim(),
    enabled: raw.enabled,
    primitives: raw.primitives,
    sources,
  });
}
