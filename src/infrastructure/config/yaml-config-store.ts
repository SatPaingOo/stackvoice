import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { AppDefinition } from '../../domain/app-definition.js';
import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
} from '../../domain/data-source.js';
import { AppNotFoundError, ConfigError, StackVoiceError } from '../../domain/errors.js';
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
  constructor(
    private readonly appsDir: string,
    private readonly backupsDir: string = join(appsDir, '..', 'backups'),
  ) {}

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

  async getApp(id: string): Promise<AppDefinition | null> {
    const path = this.pathFor(id);
    try {
      return await this.loadOne(path);
    } catch (error) {
      if (error instanceof ConfigError && /Could not read app file/.test(error.message)) return null;
      throw error;
    }
  }

  /**
   * Writes the app as canonical YAML.
   *
   * Atomic by way of a temporary file and a rename, so a crash mid-write cannot
   * leave a half-parsed config that stops the server from booting. Anything
   * being replaced is copied to `config/backups/` first: hand-authored comments
   * are not preserved by a canonical write, so the original has to survive
   * somewhere.
   */
  async saveApp(app: AppDefinition): Promise<string | null> {
    const path = this.pathFor(app.id);
    const backup = await this.backup(app.id, path);

    const temporary = `${path}.tmp`;
    await writeFile(temporary, renderApp(app), 'utf8');
    await rename(temporary, path);

    return backup;
  }

  async removeApp(id: string): Promise<string> {
    const path = this.pathFor(id);
    const backup = await this.backup(id, path);
    if (backup === null) throw new AppNotFoundError(id);

    await unlink(path);
    return backup;
  }

  private pathFor(id: string): string {
    return join(this.appsDir, `${id}.yml`);
  }

  /** Copies the current file aside, returning the backup path, or null if there was none. */
  private async backup(id: string, path: string): Promise<string | null> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = join(this.backupsDir, `${id}.yml.${stamp}`);
    try {
      await mkdir(this.backupsDir, { recursive: true });
      await copyFile(path, target);
      return target;
    } catch {
      return null;
    }
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

/**
 * Renders an app as YAML a person can read and edit afterwards. Written by hand
 * rather than with a serializer so the comments explaining the field maps
 * survive into the file the user will open next.
 */
function renderApp(app: AppDefinition): string {
  const lines: string[] = [
    `# ${app.label} — generated by \`stackvoice app add\`.`,
    '# Edit anything here, then run `stackvoice app validate` and restart.',
    '',
    `id: ${app.id}`,
    `label: ${quote(app.label)}`,
    'description: >',
    ...wrap(app.description, 68).map((line) => `  ${line}`),
    `enabled: ${String(app.enabled)}`,
    'primitives:',
    `  search: ${String(app.primitives.search)}`,
    `  read: ${String(app.primitives.read)}`,
    `  status: ${String(app.primitives.status)}`,
    'sources:',
  ];

  for (const source of app.sources) {
    lines.push(
      `  - id: ${source.id}`,
      `    type: ${source.type}`,
      `    repo: ${source.repo}`,
      `    label: ${quote(source.label)}`,
      `    views_dir: ${source.viewsDir}`,
      `    index_file: ${source.indexFile}`,
      `    stats_file: ${source.statsFile}`,
    );
    if (source.itemsPath !== null) {
      lines.push(`    items_path: ${source.itemsPath}   # the items are nested under this key`);
    }
    lines.push(
      '    # Where each spoken field lives in this payload. Change any of these.',
      '    fields:',
      `      key: ${source.fields.key}`,
      `      title: ${source.fields.title}`,
      `      summary: ${yamlValue(source.fields.summary)}`,
      `      date: ${yamlValue(source.fields.date)}`,
      `      topic: ${yamlValue(source.fields.topic)}`,
      `      region: ${yamlValue(source.fields.region)}`,
      `      url: ${yamlValue(source.fields.url)}`,
      '    status_fields:',
      `      last_data_date: ${source.statusFields.lastDataDate}`,
      `      item_count: ${source.statusFields.itemCount}`,
    );
  }

  lines.push('shortcuts: []', '');
  return lines.join('\n');
}

function yamlValue(value: string | null): string {
  return value === null ? 'null' : value;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Wraps a description so the generated file stays readable in a terminal. */
function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}
