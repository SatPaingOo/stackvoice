import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ConfigError, StackVoiceError } from '../../domain/errors.js';
import type { ShortcutStore } from '../../domain/ports/shortcut-store.js';
import { MAX_SHORTCUT_STEPS, Shortcut } from '../../domain/shortcut.js';

const stepSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

const shortcutSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  steps: z.array(stepSchema).min(1).max(MAX_SHORTCUT_STEPS),
  reply: z.string().default(''),
});

const fileSchema = z.object({
  shortcuts: z.array(shortcutSchema).default([]),
});

/**
 * Reads and writes `config/shortcuts.yml`.
 *
 * A missing file is not an error: most stacks have no shortcuts, and a server
 * that refuses to start because an optional file is absent is a bad server.
 */
export class YamlShortcutStore implements ShortcutStore {
  constructor(
    private readonly filePath: string,
    private readonly backupsDir: string = join(dirname(filePath), 'backups'),
  ) {}

  async list(): Promise<readonly Shortcut[]> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch {
      return [];
    }

    let document: unknown;
    try {
      document = parseYaml(text);
    } catch (cause) {
      throw new ConfigError('Shortcuts file is not valid YAML', this.filePath, { cause });
    }

    const parsed = fileSchema.safeParse(document ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path.join('.') || '(root)';
      throw new ConfigError(`Invalid shortcut at "${field}": ${first?.message ?? 'unknown'}`, this.filePath);
    }

    try {
      return parsed.data.shortcuts.map((raw) => new Shortcut(raw));
    } catch (cause) {
      if (cause instanceof StackVoiceError) throw new ConfigError(cause.message, this.filePath, { cause });
      throw cause;
    }
  }

  async save(shortcuts: readonly Shortcut[]): Promise<string | null> {
    const backup = await this.backup();

    const temporary = `${this.filePath}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporary, render(shortcuts), 'utf8');
    await rename(temporary, this.filePath);

    return backup;
  }

  private async backup(): Promise<string | null> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = join(this.backupsDir, `shortcuts.yml.${stamp}`);
    try {
      await mkdir(this.backupsDir, { recursive: true });
      await copyFile(this.filePath, target);
      return target;
    } catch {
      return null;
    }
  }
}

/** Canonical YAML a person can still read and edit by hand. */
function render(shortcuts: readonly Shortcut[]): string {
  const lines = [
    '# StackVoice shortcuts — one tool that runs several.',
    '# Edit here or in the web console at /console.',
    '',
    'shortcuts:',
  ];

  if (shortcuts.length === 0) lines[lines.length - 1] = 'shortcuts: []';

  for (const shortcut of shortcuts) {
    lines.push(
      `  - name: ${quote(shortcut.name)}          # becomes the tool ${shortcut.toolName}`,
      `    description: ${quote(shortcut.description)}`,
      `    enabled: ${String(shortcut.enabled)}`,
      '    steps:',
    );
    for (const step of shortcut.steps) {
      lines.push(`      - tool: ${step.tool}`, `        args: ${JSON.stringify(step.args)}`);
    }
    lines.push(`    reply: ${quote(shortcut.reply)}`);
  }

  lines.push('');
  return lines.join('\n');
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
