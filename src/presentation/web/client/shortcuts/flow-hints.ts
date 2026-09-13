import type { BlockKind, BlockWire, FlowFunction, ToolWire } from './shortcut-types.js';

/**
 * The rules the block builder applies while a flow is put together. Pure, so
 * they are unit tested without a browser. The server checks the whole flow again
 * when it is tried or saved.
 */

const SLOT = /\{([a-z][a-z0-9_]{0,23})\}/g;

export const BLOCK_LABELS: Readonly<Record<BlockKind, { readonly title: string; readonly hint: string }>> = {
  ask: { title: 'Ask', hint: 'Call a tool and save its answer' },
  if: { title: 'If', hint: 'Check something, then run one branch' },
  say: { title: 'Say', hint: 'Add a sentence to the answer' },
  get: { title: 'Get', hint: 'Save one thing read from a value' },
  set: { title: 'Set', hint: 'Save some text under a name' },
  stop: { title: 'Stop', hint: 'End here with what has been said' },
};

export const BLOCK_ORDER: readonly BlockKind[] = ['ask', 'if', 'say', 'get', 'set', 'stop'];

export const FUNCTION_LABELS: Readonly<Record<FlowFunction, string>> = {
  count: 'how many entries',
  first: 'the first entry',
  last: 'the last entry',
  item: 'entry number…',
  titles: 'the titles, as a list',
  title: 'the title',
  summary: 'the summary',
  date: 'the date',
  when: 'when, in words',
  link: 'the link',
  topic: 'the topic',
  region: 'the region',
  key: 'the key',
};

/** The tool a shortcut becomes: "Morning brief" is `morning_brief`. Same rule as the domain's. */
export function toolNameFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function slotsOf(phrase: string): string[] {
  return [...phrase.matchAll(SLOT)].map((match) => match[1] as string);
}

/** Every slot the phrases use, in the order they first appear. The server insists they all share the same ones. */
export function slotsIn(phrases: readonly string[]): string[] {
  const slots: string[] = [];
  for (const phrase of phrases) {
    for (const slot of slotsOf(phrase)) addOnce(slots, slot);
  }
  return slots;
}

/** A phrase split into words and slots, so the slots can be shown apart. */
export function phraseParts(phrase: string): { readonly text: string; readonly slot: boolean }[] {
  const parts: { text: string; slot: boolean }[] = [];
  let last = 0;
  for (const match of phrase.matchAll(SLOT)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: phrase.slice(last, at), slot: false });
    parts.push({ text: match[0], slot: true });
    last = at + match[0].length;
  }
  if (last < phrase.length) parts.push({ text: phrase.slice(last), slot: false });
  return parts;
}

export function eachBlock(
  blocks: readonly BlockWire[],
  visit: (block: BlockWire, depth: number) => void,
  depth = 1,
): void {
  for (const block of blocks) {
    visit(block, depth);
    if (block.kind === 'if') {
      eachBlock(block.then, visit, depth + 1);
      eachBlock(block.otherwise, visit, depth + 1);
    }
  }
}

export function countBlocks(blocks: readonly BlockWire[]): number {
  let count = 0;
  eachBlock(blocks, () => {
    count += 1;
  });
  return count;
}

export function countAsks(blocks: readonly BlockWire[]): number {
  let count = 0;
  eachBlock(blocks, (block) => {
    if (block.kind === 'ask') count += 1;
  });
  return count;
}

/** Names an Ask block saved its answer under: what a count or a failure check can look at. */
export function answerNames(blocks: readonly BlockWire[]): string[] {
  const names: string[] = [];
  eachBlock(blocks, (block) => {
    if (block.kind === 'ask') addOnce(names, block.as);
  });
  return names;
}

/** Every name a block saves something under. */
export function savedNames(blocks: readonly BlockWire[]): string[] {
  const names: string[] = [];
  eachBlock(blocks, (block) => {
    if (block.kind === 'ask' || block.kind === 'get') addOnce(names, block.as);
    else if (block.kind === 'set') addOnce(names, block.name);
  });
  return names;
}

/** What the Insert menu offers: slots first, then each answer with the readings people use most, then other names. */
export function insertableTokens(slots: readonly string[], blocks: readonly BlockWire[]): string[] {
  const tokens = slots.map((slot) => `{${slot}}`);
  const answers = answerNames(blocks);
  for (const name of answers) {
    tokens.push(
      `{${name}}`,
      `{${name}.count}`,
      `{${name}.titles}`,
      `{${name}.first.title}`,
      `{${name}.first.summary}`,
      `{${name}.first.when}`,
    );
  }
  for (const name of savedNames(blocks)) {
    if (!answers.includes(name)) tokens.push(`{${name}}`);
  }
  return [...new Set(tokens)];
}

/** The base name, or the base with the first free number after it. */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  let number = 2;
  while (taken.includes(`${base}${number}`)) number += 1;
  return `${base}${number}`;
}

/** Puts a token where the caret is, replacing any selection, and says where the caret goes after it. */
export function insertText(text: string, token: string, start: number, end: number): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: text.slice(0, from) + token + text.slice(to), caret: from + token.length };
}

export interface StarterContext {
  readonly tools: readonly ToolWire[];
  readonly slots: readonly string[];
  readonly blocks: readonly BlockWire[];
}

/** A new block, filled in from what the flow already has, so it starts close to right. */
export function starterBlock(kind: BlockKind, context: StarterContext): BlockWire {
  const taken = [...context.slots, ...savedNames(context.blocks)];
  const slot = context.slots[0];

  switch (kind) {
    case 'ask': {
      const tool = context.tools.find((candidate) => candidate.takesQuery) ?? context.tools[0];
      const args = tool?.takesQuery === true ? { ...(slot === undefined ? {} : { query: `{${slot}}` }), limit: 3 } : {};
      return { kind: 'ask', tool: tool?.name ?? '', args, as: uniqueName('answer', taken) };
    }
    case 'if': {
      const answer = answerNames(context.blocks)[0];
      return {
        kind: 'if',
        condition:
          answer !== undefined
            ? { kind: 'count', variable: answer, op: 'is', value: 0 }
            : { kind: 'text', template: slot === undefined ? '' : `{${slot}}`, op: 'is_not_empty', value: '' },
        then: [],
        otherwise: [],
      };
    }
    case 'say':
      return { kind: 'say', text: '' };
    case 'get':
      return {
        kind: 'get',
        fn: 'count',
        from: answerNames(context.blocks)[0] ?? slot ?? '',
        index: null,
        as: uniqueName('value', taken),
      };
    case 'set':
      return { kind: 'set', name: uniqueName('note', taken), to: '' };
    case 'stop':
      return { kind: 'stop' };
  }
}

/**
 * A server message about a field, said the way the builder shows it:
 * "blocks.1.then.0.text: what to say is missing" becomes
 * "Block 2 › Then › 1: What to say is missing".
 */
export function describeProblem(message: string): string {
  const match = /^([a-z]+(?:\.[a-z0-9_]+)*): ([\s\S]*)$/.exec(message);
  if (match === null) return message;
  const parts = (match[1] as string).split('.');
  const text = match[2] as string;

  if (parts[0] === 'triggers' && parts[1] !== undefined && /^\d+$/.test(parts[1])) {
    return `Phrase ${Number(parts[1]) + 1}: ${capitalize(text)}`;
  }
  if (parts[0] !== 'blocks') return capitalize(text);

  const where: string[] = [];
  for (const part of parts.slice(1)) {
    if (/^\d+$/.test(part)) where.push(String(Number(part) + 1));
    else if (part === 'then') where.push('Then');
    else if (part === 'otherwise') where.push('Otherwise');
    else break;
  }
  if (where.length === 0) return /^(has|asks) /.test(text) ? `This shortcut ${text}` : capitalize(text);
  return `Block ${where.join(' › ')}: ${capitalize(text)}`;
}

function addOnce(list: string[], name: string): void {
  if (name !== '' && !list.includes(name)) list.push(name);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
