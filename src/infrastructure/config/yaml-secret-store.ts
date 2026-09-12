import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

import { parse as parseYaml, stringify } from 'yaml';

import { SECRET_NAME_PATTERN } from '../../domain/data-source.js';
import { ConfigError, ValidationError } from '../../domain/errors.js';
import type { SecretStore } from '../../domain/ports/secret-store.js';

const ENV_PREFIX = 'STACKVOICE_SECRET_';

/**
 * Secrets in `config/secrets.yml`, with environment variables taking precedence.
 *
 * The file is git-ignored and written readable by its owner only. The
 * environment route is for hosts where a file on disk is the wrong place for a
 * key: `STACKVOICE_SECRET_NOTION_TOKEN` supplies `NOTION_TOKEN`.
 */
export class YamlSecretStore implements SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  async get(name: string): Promise<string | null> {
    assertName(name);
    const fromEnv = this.env[`${ENV_PREFIX}${name}`];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    return (await this.read())[name] ?? null;
  }

  async names(): Promise<readonly string[]> {
    const fromFile = Object.keys(await this.read());
    const fromEnv = Object.keys(this.env)
      .filter((key) => key.startsWith(ENV_PREFIX) && (this.env[key] ?? '') !== '')
      .map((key) => key.slice(ENV_PREFIX.length))
      .filter((name) => SECRET_NAME_PATTERN.test(name));
    return [...new Set([...fromFile, ...fromEnv])].sort();
  }

  async set(name: string, value: string): Promise<void> {
    assertName(name);
    if (value.trim() === '') throw new ValidationError('a secret cannot be empty', 'value');
    const all = await this.read();
    all[name] = value;
    await this.write(all);
  }

  async remove(name: string): Promise<void> {
    assertName(name);
    const all = await this.read();
    if (!(name in all)) return;
    delete all[name];
    await this.write(all);
  }

  private async read(): Promise<Record<string, string>> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch {
      return {};
    }

    let document: unknown;
    try {
      document = parseYaml(text);
    } catch (cause) {
      throw new ConfigError('Secrets file is not valid YAML', this.filePath, { cause });
    }

    const secrets = (document as { secrets?: unknown } | null)?.secrets;
    if (secrets === null || typeof secrets !== 'object') return {};
    return Object.fromEntries(
      Object.entries(secrets as Record<string, unknown>).filter(
        (entry): entry is [string, string] => SECRET_NAME_PATTERN.test(entry[0]) && typeof entry[1] === 'string',
      ),
    );
  }

  /** Atomic, and readable by the owner only, like any other credential file. */
  private async write(all: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const body = `# StackVoice secrets. Never commit or share this file.\n${stringify({ secrets: all })}`;
    await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

function assertName(name: string): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new ValidationError(`"${name}" is not a secret name; use capital letters, digits and underscores`, 'name');
  }
}
