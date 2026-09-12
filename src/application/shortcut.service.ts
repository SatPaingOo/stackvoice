import { StackVoiceError } from '../domain/errors.js';
import type { ArgValue, AskBlock, Block, Condition } from '../domain/flow.js';
import type { Item } from '../domain/item.js';
import type { Logger } from '../domain/ports/logger.js';
import type { Shortcut } from '../domain/shortcut.js';
import {
  applyFunction,
  evaluateCondition,
  NOTHING,
  renderTemplate,
  textOf,
  tidy,
  type FlowValue,
} from './flow-values.js';
import type { ToolRunner } from './tool-runner.service.js';

export interface StepOutcome {
  readonly tool: string;
  readonly spoken: string;
  readonly ok: boolean;
}

/** One block that ran, described for the person building the flow. */
export interface TraceEntry {
  /** Where the block sits, counted from 1: "2", or "2 › Then › 1" inside an If. */
  readonly at: string;
  readonly kind: Block['kind'];
  readonly summary: string;
  readonly ok: boolean;
  readonly ms: number;
}

export interface ShortcutResult {
  readonly spoken: string;
  /** Every tool call, in order. */
  readonly steps: readonly StepOutcome[];
  readonly trace: readonly TraceEntry[];
}

/** A slot is a few spoken words. Anything longer is not what a person said. */
const MAX_INPUT_LENGTH = 200;
const SUMMARY_TEXT = 90;
const NOTHING_TO_SAY = 'That shortcut finished without anything to say.';

/**
 * Runs a shortcut's flow and returns one spoken answer.
 *
 * In order, never in parallel: the same question gets the same answer in the
 * same shape every time, which is the point of a shortcut. A failing tool does
 * not sink the answer; its failure is saved like any other answer, so an If
 * block can speak around it.
 */
export class ShortcutService {
  constructor(
    private readonly runner: ToolRunner,
    private readonly logger: Logger,
    private readonly clock: () => Date,
  ) {}

  async run(shortcut: Shortcut, inputs: Readonly<Record<string, string>> = {}): Promise<ShortcutResult> {
    const run = new FlowRun(this.runner, this.logger, this.clock, shortcut.name);
    for (const slot of shortcut.slots) {
      run.define(slot, { kind: 'text', text: (inputs[slot] ?? '').trim().slice(0, MAX_INPUT_LENGTH) });
    }
    await run.execute(shortcut.blocks, []);
    return run.result();
  }
}

type Outcome = Pick<TraceEntry, 'summary' | 'ok'>;

/** One run of one flow: its variables, what it said, and every block that ran. */
class FlowRun {
  private readonly variables = new Map<string, FlowValue>();
  private readonly said: string[] = [];
  private readonly steps: StepOutcome[] = [];
  private readonly trace: TraceEntry[] = [];
  private readonly now: Date;
  private stopped = false;

  constructor(
    private readonly runner: ToolRunner,
    private readonly logger: Logger,
    private readonly clock: () => Date,
    private readonly shortcutName: string,
  ) {
    // One moment for the whole run, so every date in one answer is measured from the same "now".
    this.now = clock();
  }

  define(name: string, value: FlowValue): void {
    this.variables.set(name, value);
  }

  async execute(blocks: readonly Block[], at: readonly string[]): Promise<void> {
    for (const [index, block] of blocks.entries()) {
      if (this.stopped) return;
      const position = [...at, String(index + 1)];
      const started = this.clock().getTime();

      if (block.kind === 'if') {
        const yes = evaluateCondition(block.condition, this.variables, this.now);
        this.record(block, position, started, {
          ok: true,
          summary: `${this.describeCondition(block.condition)}: ${yes ? 'yes, so Then ran' : 'no, so Otherwise ran'}.`,
        });
        await this.execute(yes ? block.then : block.otherwise, [...position, yes ? 'Then' : 'Otherwise']);
        continue;
      }

      this.record(block, position, started, await this.runBlock(block));
    }
  }

  result(): { spoken: string; steps: readonly StepOutcome[]; trace: readonly TraceEntry[] } {
    // A flow that says nothing answers with what its tools said, as shortcuts always did.
    const spoken =
      this.said.length > 0
        ? tidy(this.said.join(' '))
        : tidy(this.steps.map((step) => step.spoken).filter((text) => text.trim() !== '').join(' '));
    return { spoken: spoken === '' ? NOTHING_TO_SAY : spoken, steps: this.steps, trace: this.trace };
  }

  private async runBlock(block: Exclude<Block, { kind: 'if' }>): Promise<Outcome> {
    switch (block.kind) {
      case 'ask':
        return this.ask(block);
      case 'say': {
        const line = tidy(renderTemplate(block.text, this.variables, this.now));
        if (line === '') return { ok: true, summary: 'Said nothing: every part of the text was empty.' };
        this.said.push(line);
        return { ok: true, summary: `Said "${clip(line)}"` };
      }
      case 'get': {
        const value = applyFunction(this.variables.get(block.from) ?? NOTHING, block.fn, block.index, this.now);
        this.define(block.as, value);
        const which = block.index === null ? '' : ` number ${block.index}`;
        return { ok: true, summary: `Got ${block.fn}${which} of ${block.from}: "${clip(textOf(value))}", saved as ${block.as}.` };
      }
      case 'set': {
        const value = renderTemplate(block.to, this.variables, this.now).trim();
        this.define(block.name, { kind: 'text', text: value });
        return { ok: true, summary: `Set ${block.name} to "${clip(value)}".` };
      }
      case 'stop':
        this.stopped = true;
        return { ok: true, summary: 'Stopped here.' };
    }
  }

  private async ask(block: AskBlock): Promise<Outcome> {
    const args = this.renderArgs(block.args);
    const asked = `Asked ${block.tool}${describeArgs(args)}`;

    try {
      const output = await this.runner.run(block.tool, args);
      const items = itemsFrom(output.structured);
      this.define(block.as, { kind: 'answer', spoken: output.spoken, ok: true, items });
      this.steps.push({ tool: block.tool, spoken: output.spoken, ok: true });
      const got = items.length > 0 ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : `"${clip(output.spoken)}"`;
      return { ok: true, summary: `${asked}, saved as ${block.as}: ${got}.` };
    } catch (error) {
      const message = error instanceof StackVoiceError ? error.message : `${block.tool} did not answer.`;
      this.logger.warn('shortcut step failed', { shortcut: this.shortcutName, tool: block.tool });
      this.define(block.as, { kind: 'answer', spoken: message, ok: false, items: [] });
      this.steps.push({ tool: block.tool, spoken: message, ok: false });
      return { ok: false, summary: `${asked}, and it failed: ${message}` };
    }
  }

  /** Text arguments are templates. One that comes out empty is left out, so "{topic}" with no topic searches everything. */
  private renderArgs(args: Readonly<Record<string, ArgValue>>): Record<string, ArgValue> {
    const rendered: Record<string, ArgValue> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== 'string') {
        rendered[key] = value;
        continue;
      }
      const text = renderTemplate(value, this.variables, this.now).trim();
      if (text !== '') rendered[key] = text;
    }
    return rendered;
  }

  private describeCondition(condition: Condition): string {
    switch (condition.kind) {
      case 'count': {
        const count = textOf(applyFunction(this.variables.get(condition.variable) ?? NOTHING, 'count', null, this.now));
        const op = { is: 'exactly', more_than: 'more than', less_than: 'fewer than' }[condition.op];
        return `Does ${condition.variable} have ${op} ${condition.value}? It has ${count}`;
      }
      case 'text': {
        const actual = clip(renderTemplate(condition.template, this.variables, this.now).trim());
        const expected = clip(renderTemplate(condition.value, this.variables, this.now).trim());
        const op = { contains: `contain "${expected}"`, is: `say "${expected}"`, is_empty: 'come out empty', is_not_empty: 'have anything in it' }[condition.op];
        return `Does "${actual}" ${op}`;
      }
      case 'failed':
        return `Did ${condition.variable} fail`;
    }
  }

  private record(block: Block, position: readonly string[], started: number, outcome: Outcome): void {
    this.trace.push({
      at: position.join(' › '),
      kind: block.kind,
      summary: outcome.summary,
      ok: outcome.ok,
      ms: Math.max(0, this.clock().getTime() - started),
    });
  }
}

/** The entries behind a tool's answer: a search's list, or the one a read found. */
function itemsFrom(structured: Record<string, unknown> | null): Item[] {
  if (structured === null) return [];
  const list = structured['items'];
  if (Array.isArray(list)) return list.filter(isItem);
  const item = structured['item'];
  return isItem(item) ? [item] : [];
}

function isItem(value: unknown): value is Item {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { key?: unknown; title?: unknown };
  return typeof candidate.key === 'string' && typeof candidate.title === 'string';
}

function describeArgs(args: Readonly<Record<string, ArgValue>>): string {
  const parts = Object.entries(args).map(([key, value]) => `${key} ${typeof value === 'string' ? `"${clip(value)}"` : String(value)}`);
  return parts.length === 0 ? '' : ` with ${parts.join(', ')}`;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= SUMMARY_TEXT ? clean : `${clean.slice(0, SUMMARY_TEXT - 1)}…`;
}
