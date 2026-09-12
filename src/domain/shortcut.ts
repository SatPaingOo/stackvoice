import { ValidationError } from './errors.js';

export const MAX_SHORTCUT_STEPS = 4;

export interface ShortcutStep {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ShortcutProps {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly ShortcutStep[];
  /**
   * How the answers are stitched together. `{results}` is every step joined;
   * `{1}`, `{2}` are individual steps. Empty means join them with a space.
   */
  readonly reply: string;
  readonly enabled: boolean;
}

/**
 * A macro over several tools, exposed as one tool.
 *
 * "What's my morning brief" is two questions in a trench coat: what did my
 * library find, and is my stack healthy. Asking an assistant to chain those is
 * two round trips and a chance to get the order wrong. A shortcut makes it one
 * deterministic call, which is also what makes it demonstrable.
 *
 * Shortcuts are cross-app by nature, so they live in `config/shortcuts.yml`
 * rather than inside any one app's file.
 */
export class Shortcut {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly ShortcutStep[];
  readonly reply: string;
  readonly enabled: boolean;

  constructor(props: ShortcutProps) {
    const name = props.name.trim();
    if (name === '') throw new ValidationError('a shortcut needs a name', 'name');

    const toolName = Shortcut.toolNameFor(name);
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(toolName)) {
      throw new ValidationError(
        `"${name}" does not make a usable tool name. Use letters, numbers and spaces.`,
        'name',
      );
    }
    if (props.steps.length === 0) {
      throw new ValidationError(`"${name}" has no steps`, 'steps');
    }
    if (props.steps.length > MAX_SHORTCUT_STEPS) {
      throw new ValidationError(
        `"${name}" has ${props.steps.length} steps; at most ${MAX_SHORTCUT_STEPS} keeps the answer speakable`,
        'steps',
      );
    }
    for (const step of props.steps) {
      if (step.tool.trim() === '') throw new ValidationError(`"${name}" has a step with no tool`, 'steps');
    }

    this.name = name;
    this.description = props.description.trim();
    this.steps = props.steps;
    this.reply = props.reply;
    this.enabled = props.enabled;
  }

  /** The MCP tool this shortcut becomes: "morning brief" → `morning_brief`. */
  get toolName(): string {
    return Shortcut.toolNameFor(this.name);
  }

  static toolNameFor(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /** The tools this shortcut depends on, so a broken reference can be reported. */
  requiredTools(): readonly string[] {
    return [...new Set(this.steps.map((step) => step.tool))];
  }
}

/**
 * Fills the reply template with each step's spoken answer.
 *
 * Deliberately not a template engine: a shortcut that can compute is a shortcut
 * that can fail in ways the person who wrote it cannot see.
 */
export function renderReply(reply: string, answers: readonly string[]): string {
  const joined = answers.filter((answer) => answer.trim() !== '').join(' ');
  if (reply.trim() === '') return joined;

  return reply
    .replace(/\{results\}/g, joined)
    .replace(/\{(\d+)\}/g, (_match, index: string) => answers[Number(index) - 1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
