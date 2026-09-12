import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ConfigError, StackVoiceError, ValidationError } from '../../domain/errors.js';
import {
  blocksFromSteps,
  COUNT_OPERATORS,
  parseBlocks,
  TEXT_OPERATORS,
  type Block,
  type Condition,
} from '../../domain/flow.js';
import type { ShortcutStore } from '../../domain/ports/shortcut-store.js';
import { Shortcut } from '../../domain/shortcut.js';

const stepSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

const shortcutSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  enabled: z.boolean().default(true),
  triggers: z.array(z.string()).default([]),
  blocks: z.array(z.unknown()).min(1).optional(),
  /** Before flows: steps that ran in order, and a reply that stitched their answers. Still read, never written. */
  steps: z.array(stepSchema).min(1).optional(),
  reply: z.string().default(''),
});

const fileSchema = z.object({
  shortcuts: z.array(shortcutSchema).default([]),
});

type RawShortcut = z.infer<typeof shortcutSchema>;

const BLOCK_KEYS = ['ask', 'if', 'say', 'get', 'set', 'stop'] as const;

/**
 * Reads and writes `config/shortcuts.yml`.
 *
 * The file uses a shorthand a person can write by hand: `- ask: library_search`
 * rather than `kind: ask`. It is converted to blocks on the way in and back on
 * the way out, and the domain checks what the blocks mean. A file written before
 * flows, with steps and a reply, still loads and answers as it did.
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
      return parsed.data.shortcuts.map((raw, index) => toShortcut(raw, `shortcuts.${index}`));
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

function toShortcut(raw: RawShortcut, field: string): Shortcut {
  if (raw.blocks !== undefined && raw.steps !== undefined) {
    throw new ValidationError('has both blocks and steps; blocks replace steps, so keep only the blocks', field);
  }

  let blocks: Block[];
  if (raw.blocks !== undefined) {
    blocks = parseBlocks(fromYamlBlocks(raw.blocks, `${field}.blocks`), `${field}.blocks`);
  } else if (raw.steps !== undefined) {
    blocks = blocksFromSteps(raw.steps, raw.reply);
  } else {
    throw new ValidationError('needs blocks to run', `${field}.blocks`);
  }

  return new Shortcut({
    name: raw.name,
    description: raw.description,
    enabled: raw.enabled,
    triggers: raw.triggers,
    blocks,
  });
}

// ---- shorthand to blocks ----------------------------------------------------

function fromYamlBlocks(raw: unknown, field: string): unknown[] {
  if (!Array.isArray(raw)) throw new ValidationError('must be a list of blocks', field);
  return raw.map((entry, index) => fromYamlBlock(entry, `${field}.${index}`));
}

function fromYamlBlock(raw: unknown, field: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('expected a block', field);
  }
  const entry = raw as Record<string, unknown>;
  const kinds = BLOCK_KEYS.filter((key) => key in entry);
  if (kinds.length !== 1) {
    throw new ValidationError(`a block starts with exactly one of ${BLOCK_KEYS.join(', ')}`, field);
  }

  switch (kinds[0]) {
    case 'ask':
      return { kind: 'ask', tool: entry['ask'], args: entry['with'], as: entry['as'] };
    case 'if':
      return {
        kind: 'if',
        condition: fromYamlCondition(entry['if'], `${field}.if`),
        then: fromYamlBlocks(entry['then'] ?? [], `${field}.then`),
        otherwise: fromYamlBlocks(entry['otherwise'] ?? [], `${field}.otherwise`),
      };
    case 'say':
      return { kind: 'say', text: entry['say'] };
    case 'get':
      return { kind: 'get', fn: entry['get'], from: entry['from'], index: entry['index'], as: entry['as'] };
    case 'set':
      return { kind: 'set', name: entry['set'], to: entry['to'] };
    default:
      return { kind: 'stop' };
  }
}

function fromYamlCondition(raw: unknown, field: string): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('expected a condition', field);
  }
  const entry = raw as Record<string, unknown>;

  if ('count_of' in entry) {
    const op = COUNT_OPERATORS.find((key) => key in entry);
    return { kind: 'count', variable: entry['count_of'], op, value: op === undefined ? undefined : entry[op] };
  }
  if ('text' in entry) {
    const op = TEXT_OPERATORS.find((key) => key in entry);
    return { kind: 'text', template: entry['text'], op, value: op === 'contains' || op === 'is' ? entry[op] : undefined };
  }
  if ('failed' in entry) {
    return { kind: 'failed', variable: entry['failed'] };
  }
  throw new ValidationError('a condition is count_of, text or failed', field);
}

// ---- blocks to shorthand ----------------------------------------------------

/**
 * Canonical YAML a person can still read and edit by hand. Every string is
 * written quoted, so a name like `null` or a phrase with a colon reads back as
 * the same text.
 */
function render(shortcuts: readonly Shortcut[]): string {
  const lines = [
    '# StackVoice shortcuts — one tool that runs a flow of blocks.',
    '# Edit here or in the web console at /console/shortcuts.',
    '',
    'shortcuts:',
  ];

  if (shortcuts.length === 0) lines[lines.length - 1] = 'shortcuts: []';

  for (const shortcut of shortcuts) {
    lines.push(
      `  - name: ${quote(shortcut.name)}          # becomes the tool ${shortcut.toolName}`,
      `    description: ${quote(shortcut.description)}`,
      `    enabled: ${String(shortcut.enabled)}`,
    );
    if (shortcut.triggers.length > 0) lines.push(`    triggers: ${JSON.stringify(shortcut.triggers)}`);
    lines.push('    blocks:');
    renderBlocks(shortcut.blocks, 6, lines);
  }

  lines.push('');
  return lines.join('\n');
}

function renderBlocks(blocks: readonly Block[], indent: number, lines: string[]): void {
  const pad = ' '.repeat(indent);
  for (const block of blocks) {
    switch (block.kind) {
      case 'ask':
        lines.push(`${pad}- ask: ${quote(block.tool)}`);
        if (Object.keys(block.args).length > 0) lines.push(`${pad}  with: ${JSON.stringify(block.args)}`);
        lines.push(`${pad}  as: ${quote(block.as)}`);
        break;
      case 'if':
        lines.push(`${pad}- if: ${JSON.stringify(toYamlCondition(block.condition))}`);
        lines.push(`${pad}  then:${block.then.length === 0 ? ' []' : ''}`);
        renderBlocks(block.then, indent + 4, lines);
        if (block.otherwise.length > 0) {
          lines.push(`${pad}  otherwise:`);
          renderBlocks(block.otherwise, indent + 4, lines);
        }
        break;
      case 'say':
        lines.push(`${pad}- say: ${quote(block.text)}`);
        break;
      case 'get':
        lines.push(`${pad}- get: ${quote(block.fn)}`, `${pad}  from: ${quote(block.from)}`);
        if (block.index !== null) lines.push(`${pad}  index: ${block.index}`);
        lines.push(`${pad}  as: ${quote(block.as)}`);
        break;
      case 'set':
        lines.push(`${pad}- set: ${quote(block.name)}`, `${pad}  to: ${quote(block.to)}`);
        break;
      case 'stop':
        lines.push(`${pad}- stop: true`);
        break;
    }
  }
}

function toYamlCondition(condition: Condition): Record<string, unknown> {
  switch (condition.kind) {
    case 'count':
      return { count_of: condition.variable, [condition.op]: condition.value };
    case 'text':
      return {
        text: condition.template,
        [condition.op]: condition.op === 'contains' || condition.op === 'is' ? condition.value : true,
      };
    case 'failed':
      return { failed: condition.variable };
  }
}

/** JSON's quoting is valid YAML and escapes everything that needs it. */
function quote(value: string): string {
  return JSON.stringify(value);
}
