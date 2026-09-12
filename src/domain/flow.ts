import { ValidationError } from './errors.js';

/**
 * What a shortcut runs: blocks in order, the way a shortcut on a phone does.
 *
 * Six kinds of block and nothing that executes code, so a person builds one in
 * the console without writing any. A flow that passes `validateFlow` cannot loop,
 * cannot nest past what a person can follow, and cannot fan out into more tool
 * calls than a spoken answer can wait for.
 */

/** The most blocks in one flow, counting the ones inside If blocks. */
export const MAX_FLOW_BLOCKS = 16;
/** The most tool calls a flow can make, counted across every branch, so the worst case is still quick. */
export const MAX_FLOW_ASKS = 4;
/** An If inside an If is fine. A third level is not something a person can follow by ear. */
export const MAX_FLOW_DEPTH = 2;
export const MAX_TRIGGERS = 5;
export const MAX_SLOTS = 3;
export const MAX_FLOW_TEXT = 400;
const MAX_TRIGGER_LENGTH = 80;
const MAX_ITEM_INDEX = 50;

export const BLOCK_KINDS = ['ask', 'if', 'say', 'get', 'set', 'stop'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** What a Get block, or a dot in a template such as {found.count}, can read from a value. */
export const FLOW_FUNCTIONS = [
  'count',
  'first',
  'last',
  'item',
  'titles',
  'title',
  'summary',
  'date',
  'when',
  'link',
  'topic',
  'region',
  'key',
] as const;
export type FlowFunction = (typeof FLOW_FUNCTIONS)[number];

/** `item` needs a number, which a dot in a template cannot carry. A Get block can. */
export const TEMPLATE_FUNCTIONS: readonly FlowFunction[] = FLOW_FUNCTIONS.filter((fn) => fn !== 'item');

export const COUNT_OPERATORS = ['is', 'more_than', 'less_than'] as const;
export type CountOperator = (typeof COUNT_OPERATORS)[number];

export const TEXT_OPERATORS = ['contains', 'is', 'is_empty', 'is_not_empty'] as const;
export type TextOperator = (typeof TEXT_OPERATORS)[number];

export type Condition =
  | { readonly kind: 'count'; readonly variable: string; readonly op: CountOperator; readonly value: number }
  | { readonly kind: 'text'; readonly template: string; readonly op: TextOperator; readonly value: string }
  | { readonly kind: 'failed'; readonly variable: string };

export type ArgValue = string | number | boolean;

export interface AskBlock {
  readonly kind: 'ask';
  readonly tool: string;
  /** String values are templates: "{topic}" becomes what the person said. */
  readonly args: Readonly<Record<string, ArgValue>>;
  readonly as: string;
}

export interface IfBlock {
  readonly kind: 'if';
  readonly condition: Condition;
  readonly then: readonly Block[];
  readonly otherwise: readonly Block[];
}

export interface SayBlock {
  readonly kind: 'say';
  readonly text: string;
}

export interface GetBlock {
  readonly kind: 'get';
  readonly fn: FlowFunction;
  readonly from: string;
  /** Which entry, counted from 1, for `item`. Null for every other function. */
  readonly index: number | null;
  readonly as: string;
}

export interface SetBlock {
  readonly kind: 'set';
  readonly name: string;
  readonly to: string;
}

export interface StopBlock {
  readonly kind: 'stop';
}

export type Block = AskBlock | IfBlock | SayBlock | GetBlock | SetBlock | StopBlock;

/** Variable and slot names: short, lowercase, and safe to put in braces. */
export const NAME_PATTERN = /^[a-z][a-z0-9_]{0,23}$/;
const SLOT_PATTERN = /\{([a-z][a-z0-9_]{0,23})\}/g;
const REFERENCE_PATTERN = /\{([a-z][a-z0-9_]*)((?:\.[a-z0-9_]+)*)\}/g;
const ARG_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]{0,31}$/;

export function isFlowFunction(value: string): value is FlowFunction {
  return (FLOW_FUNCTIONS as readonly string[]).includes(value);
}

/** The slots a phrase leaves for the person to fill, in the order they appear. */
export function slotsOf(trigger: string): string[] {
  return [...trigger.matchAll(SLOT_PATTERN)].map((match) => match[1] as string);
}

/** Visits every block, inside If blocks too, in the order a person reads them. */
export function eachBlock(
  blocks: readonly Block[],
  visit: (block: Block, field: string, depth: number) => void,
  field = 'blocks',
  depth = 1,
): void {
  blocks.forEach((block, index) => {
    const here = `${field}.${index}`;
    visit(block, here, depth);
    if (block.kind === 'if') {
      eachBlock(block.then, visit, `${here}.then`, depth + 1);
      eachBlock(block.otherwise, visit, `${here}.otherwise`, depth + 1);
    }
  });
}

// ---- parsing untrusted input ------------------------------------------------

/**
 * Reads blocks from data nobody has checked: a request body or a converted
 * config file. Shape only. What the blocks mean is `validateFlow`'s job.
 *
 * @throws {ValidationError} naming the path of the first bad field, such as `blocks.2.then.0.tool`.
 */
export function parseBlocks(raw: unknown, field = 'blocks'): Block[] {
  if (!Array.isArray(raw)) throw new ValidationError('blocks must be a list', field);
  return raw.map((entry, index) => parseBlock(entry, `${field}.${index}`));
}

function parseBlock(raw: unknown, field: string): Block {
  const entry = record(raw, field, 'a block');

  switch (entry['kind']) {
    case 'ask':
      return {
        kind: 'ask',
        tool: text(entry['tool'], `${field}.tool`, 'the tool to ask'),
        args: parseArgs(entry['args'], `${field}.args`),
        as: name(entry['as'], `${field}.as`),
      };
    case 'if':
      return {
        kind: 'if',
        condition: parseCondition(entry['condition'], `${field}.condition`),
        then: parseBlocks(entry['then'] ?? [], `${field}.then`),
        otherwise: parseBlocks(entry['otherwise'] ?? [], `${field}.otherwise`),
      };
    case 'say':
      return { kind: 'say', text: text(entry['text'], `${field}.text`, 'what to say') };
    case 'get':
      return {
        kind: 'get',
        fn: oneOf(entry['fn'], FLOW_FUNCTIONS, `${field}.fn`),
        from: name(entry['from'], `${field}.from`),
        index: entry['index'] === undefined || entry['index'] === null ? null : integer(entry['index'], `${field}.index`, 1, MAX_ITEM_INDEX),
        as: name(entry['as'], `${field}.as`),
      };
    case 'set':
      return { kind: 'set', name: name(entry['name'], `${field}.name`), to: optionalText(entry['to'], `${field}.to`) };
    case 'stop':
      return { kind: 'stop' };
    default:
      throw new ValidationError(`a block must be one of ${BLOCK_KINDS.join(', ')}`, `${field}.kind`);
  }
}

function parseCondition(raw: unknown, field: string): Condition {
  const entry = record(raw, field, 'a condition');

  switch (entry['kind']) {
    case 'count':
      return {
        kind: 'count',
        variable: name(entry['variable'], `${field}.variable`),
        op: oneOf(entry['op'], COUNT_OPERATORS, `${field}.op`),
        value: integer(entry['value'], `${field}.value`, 0, 1000),
      };
    case 'text': {
      const op = oneOf(entry['op'], TEXT_OPERATORS, `${field}.op`);
      const needsValue = op === 'contains' || op === 'is';
      return {
        kind: 'text',
        template: text(entry['template'], `${field}.template`, 'the text to check'),
        op,
        value: needsValue ? text(entry['value'], `${field}.value`, 'what to compare it with') : '',
      };
    }
    case 'failed':
      return { kind: 'failed', variable: name(entry['variable'], `${field}.variable`) };
    default:
      throw new ValidationError('a condition checks a count, a text, or whether a tool failed', `${field}.kind`);
  }
}

function parseArgs(raw: unknown, field: string): Record<string, ArgValue> {
  if (raw === undefined || raw === null) return {};
  const entry = record(raw, field, 'the arguments');
  const args: Record<string, ArgValue> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!ARG_NAME_PATTERN.test(key)) throw new ValidationError(`"${key}" is not an argument name`, `${field}.${key}`);
    if (typeof value === 'string') {
      if (value.length > MAX_FLOW_TEXT) throw new ValidationError(`is longer than ${MAX_FLOW_TEXT} characters`, `${field}.${key}`);
      args[key] = value;
    } else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') {
      args[key] = value;
    } else {
      throw new ValidationError(`"${key}" must be text, a number, or true or false`, `${field}.${key}`);
    }
  }
  return args;
}

function record(raw: unknown, field: string, what: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError(`expected ${what}`, field);
  }
  return raw as Record<string, unknown>;
}

function text(raw: unknown, field: string, what: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') throw new ValidationError(`${what} is missing`, field);
  if (value.length > MAX_FLOW_TEXT) throw new ValidationError(`is longer than ${MAX_FLOW_TEXT} characters`, field);
  return value;
}

function optionalText(raw: unknown, field: string): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string') throw new ValidationError('must be text', field);
  if (raw.length > MAX_FLOW_TEXT) throw new ValidationError(`is longer than ${MAX_FLOW_TEXT} characters`, field);
  return raw.trim();
}

function name(raw: unknown, field: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!NAME_PATTERN.test(value)) {
    throw new ValidationError(
      `"${value}" is not a name a flow can use: lowercase letters, digits and _, starting with a letter`,
      field,
    );
  }
  return value;
}

function oneOf<T extends string>(raw: unknown, choices: readonly T[], field: string): T {
  if (typeof raw === 'string' && (choices as readonly string[]).includes(raw)) return raw as T;
  throw new ValidationError(`must be one of ${choices.join(', ')}`, field);
}

function integer(raw: unknown, field: string, min: number, max: number): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max) return raw;
  throw new ValidationError(`must be a whole number from ${min} to ${max}`, field);
}

// ---- meaning ----------------------------------------------------------------

export interface FlowShape {
  readonly triggers: readonly string[];
  readonly blocks: readonly Block[];
}

/**
 * Checks what a flow means once its shape is right: the limits, that every
 * phrase leaves the same slots, and that every name a block uses is set by
 * something, so a typo is caught when the flow is saved rather than heard as a
 * gap in the answer.
 *
 * @returns the slots every phrase shares, in the order the first phrase uses them.
 * @throws {ValidationError}
 */
export function validateFlow(flow: FlowShape): readonly string[] {
  const slots = validateTriggers(flow.triggers);
  if (flow.blocks.length === 0) throw new ValidationError('a shortcut needs at least one block', 'blocks');

  let blockCount = 0;
  let askCount = 0;
  const defined = new Set<string>(slots);
  const answers = new Set<string>();

  const define = (variable: string, field: string): void => {
    if (slots.includes(variable)) {
      throw new ValidationError(`{${variable}} is already a slot in the phrase; save this under another name`, field);
    }
    defined.add(variable);
  };

  eachBlock(flow.blocks, (block, field, depth) => {
    blockCount += 1;
    switch (block.kind) {
      case 'ask':
        askCount += 1;
        define(block.as, `${field}.as`);
        answers.add(block.as);
        break;
      case 'if':
        if (depth > MAX_FLOW_DEPTH) {
          throw new ValidationError(`an If can sit inside another If, but no deeper`, field);
        }
        if (block.then.length === 0 && block.otherwise.length === 0) {
          throw new ValidationError('an If needs a block under Then or Otherwise', field);
        }
        break;
      case 'get':
        define(block.as, `${field}.as`);
        break;
      case 'set':
        define(block.name, `${field}.name`);
        break;
      case 'say':
      case 'stop':
        break;
    }
  });

  if (blockCount > MAX_FLOW_BLOCKS) {
    throw new ValidationError(`has ${blockCount} blocks; at most ${MAX_FLOW_BLOCKS} keeps a flow followable`, 'blocks');
  }
  if (askCount > MAX_FLOW_ASKS) {
    throw new ValidationError(`asks ${askCount} tools; at most ${MAX_FLOW_ASKS} keeps the answer quick`, 'blocks');
  }

  const checkTemplate = (template: string, field: string): void => {
    for (const match of template.matchAll(REFERENCE_PATTERN)) {
      const root = match[1] as string;
      if (!defined.has(root)) {
        throw new ValidationError(
          `{${root}} is used, but nothing sets it. Make it a slot in the phrase, or save an answer under that name.`,
          field,
        );
      }
      for (const accessor of (match[2] ?? '').split('.').filter((part) => part !== '')) {
        if (!(TEMPLATE_FUNCTIONS as readonly string[]).includes(accessor)) {
          throw new ValidationError(
            `{${root}${match[2] ?? ''}} asks for "${accessor}", which a flow cannot read. Use one of ${TEMPLATE_FUNCTIONS.join(', ')}.`,
            field,
          );
        }
      }
    }
  };

  const checkAnswer = (variable: string, field: string): void => {
    if (!answers.has(variable)) {
      throw new ValidationError(`"${variable}" is not the name an Ask block saved its answer under`, field);
    }
  };

  eachBlock(flow.blocks, (block, field) => {
    switch (block.kind) {
      case 'ask':
        for (const [key, value] of Object.entries(block.args)) {
          if (typeof value === 'string') checkTemplate(value, `${field}.args.${key}`);
        }
        break;
      case 'if':
        if (block.condition.kind === 'text') {
          checkTemplate(block.condition.template, `${field}.condition.template`);
          checkTemplate(block.condition.value, `${field}.condition.value`);
        } else {
          checkAnswer(block.condition.variable, `${field}.condition.variable`);
        }
        break;
      case 'say':
        checkTemplate(block.text, `${field}.text`);
        break;
      case 'get':
        if (!defined.has(block.from)) {
          throw new ValidationError(`"${block.from}" is used, but nothing sets it`, `${field}.from`);
        }
        if (block.fn === 'item' && block.index === null) {
          throw new ValidationError('say which entry to get, counted from 1', `${field}.index`);
        }
        break;
      case 'set':
        checkTemplate(block.to, `${field}.to`);
        break;
      case 'stop':
        break;
    }
  });

  return slots;
}

function validateTriggers(triggers: readonly string[]): string[] {
  if (triggers.length > MAX_TRIGGERS) {
    throw new ValidationError(`at most ${MAX_TRIGGERS} ways to say it`, 'triggers');
  }

  let shared: string[] | null = null;
  for (const [index, trigger] of triggers.entries()) {
    const field = `triggers.${index}`;
    if (trigger.length > MAX_TRIGGER_LENGTH) {
      throw new ValidationError(`"${trigger}" is longer than ${MAX_TRIGGER_LENGTH} characters`, field);
    }

    const slots = slotsOf(trigger);
    const words = trigger.replace(SLOT_PATTERN, ' ');
    if (/[{}]/.test(words)) {
      throw new ValidationError(`"${trigger}" has a slot that is not a lowercase name in braces, such as {topic}`, field);
    }
    if (!/[\p{L}\p{N}]/u.test(words)) {
      throw new ValidationError(`"${trigger}" needs words around its slots, or it would match anything anyone says`, field);
    }
    if (new Set(slots).size !== slots.length) {
      throw new ValidationError(`"${trigger}" uses the same slot twice`, field);
    }
    if (slots.length > MAX_SLOTS) {
      throw new ValidationError(`"${trigger}" has ${slots.length} slots; at most ${MAX_SLOTS}`, field);
    }

    if (shared === null) {
      shared = slots;
    } else if (shared.length !== slots.length || shared.some((slot) => !slots.includes(slot))) {
      throw new ValidationError(
        `every way to say it needs the same slots, but "${triggers[0] as string}" and "${trigger}" differ`,
        field,
      );
    }
  }
  return shared ?? [];
}

// ---- shortcuts from before flows --------------------------------------------

export interface LegacyStep {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * A shortcut written before flows: steps that ran in order, and a reply where
 * {1}, {2} or {results} stood for their answers. The same behaviour as blocks,
 * so old files keep answering exactly as they did.
 */
export function blocksFromSteps(steps: readonly LegacyStep[], reply: string): Block[] {
  const names = steps.map((_step, index) => `step${index + 1}`);
  const blocks: Block[] = steps.map((step, index) => ({
    kind: 'ask',
    tool: step.tool,
    args: Object.fromEntries(
      Object.entries(step.args).filter(
        (entry): entry is [string, ArgValue] =>
          typeof entry[1] === 'string' || typeof entry[1] === 'number' || typeof entry[1] === 'boolean',
      ),
    ),
    as: names[index] as string,
  }));

  const text = reply
    .replace(/\{results\}/g, names.map((step) => `{${step}}`).join(' '))
    .replace(/\{(\d+)\}/g, (_match, digits: string) => {
      const step = names[Number(digits) - 1];
      return step === undefined ? '' : `{${step}}`;
    })
    .replace(/\s+/g, ' ')
    .trim();

  // An empty reply used to mean "join the answers", which is what a flow with nothing to say does.
  if (text !== '') blocks.push({ kind: 'say', text });
  return blocks;
}
