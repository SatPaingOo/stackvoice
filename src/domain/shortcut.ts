import { ValidationError } from './errors.js';
import { eachBlock, validateFlow, type Block } from './flow.js';

export interface ShortcutProps {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  /** Ways to say it, such as "news about {topic}". Empty means the name itself is the phrase. */
  readonly triggers: readonly string[];
  readonly blocks: readonly Block[];
}

/**
 * A flow over the stack's tools, exposed as one tool.
 *
 * "What's my morning brief" is two questions in a trench coat: what did my
 * library find, and is my stack healthy. A shortcut makes that one deterministic
 * call, and its blocks decide what gets said: ask a tool, check the answer, say
 * something, stop. A phrase with slots lets the person fill in part of it, and
 * each slot becomes an input the assistant fills.
 *
 * Shortcuts are cross-app by nature, so they live in `config/shortcuts.yml`
 * rather than inside any one app's file.
 */
export class Shortcut {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly triggers: readonly string[];
  readonly blocks: readonly Block[];
  private readonly slotNames: readonly string[];

  constructor(props: ShortcutProps) {
    const name = props.name.trim();
    if (name === '') throw new ValidationError('a shortcut needs a name', 'name');

    const toolName = Shortcut.toolNameFor(name);
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(toolName)) {
      throw new ValidationError(`"${name}" does not make a usable tool name. Use letters, numbers and spaces.`, 'name');
    }

    const triggers = props.triggers
      .map((trigger) => trigger.replace(/\s+/g, ' ').trim())
      .filter((trigger) => trigger !== '');

    this.slotNames = validateFlow({ triggers, blocks: props.blocks });
    this.name = name;
    this.description = props.description.trim();
    this.enabled = props.enabled;
    this.triggers = triggers;
    this.blocks = props.blocks;
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

  /** What a person says to run it. With no phrases written, the name is the phrase. */
  phrases(): readonly string[] {
    return this.triggers.length > 0 ? this.triggers : [this.name];
  }

  /** What the person fills in, such as `topic` in "news about {topic}". Each becomes a tool input. */
  get slots(): readonly string[] {
    return this.slotNames;
  }

  /** The tools this shortcut can ask, each once, in the order they first appear. */
  requiredTools(): readonly string[] {
    const tools: string[] = [];
    eachBlock(this.blocks, (block) => {
      if (block.kind === 'ask' && !tools.includes(block.tool)) tools.push(block.tool);
    });
    return tools;
  }
}
