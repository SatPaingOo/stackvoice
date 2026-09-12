import { describe, expect, it } from 'vitest';

import type { Block } from '../../../../../src/domain/flow.js';
import { Shortcut } from '../../../../../src/domain/shortcut.js';
import {
  answerNames,
  countAsks,
  countBlocks,
  describeProblem,
  insertableTokens,
  insertText,
  phraseParts,
  savedNames,
  slotsIn,
  starterBlock,
  toolNameFor,
  uniqueName,
} from '../../../../../src/presentation/web/client/shortcuts/flow-hints.js';
import type { BlockWire, ToolWire } from '../../../../../src/presentation/web/client/shortcuts/shortcut-types.js';

const search: ToolWire = { name: 'library_search', title: 'Search library', verb: 'search', takesQuery: true, needsKey: false };
const status: ToolWire = { name: 'stack_status', title: 'Stack status', verb: 'stack_status', takesQuery: false, needsKey: false };

const flow: BlockWire[] = [
  { kind: 'ask', tool: 'library_search', args: { query: '{topic}' }, as: 'found' },
  {
    kind: 'if',
    condition: { kind: 'failed', variable: 'found' },
    then: [
      { kind: 'set', name: 'excuse', to: 'The library is down.' },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' },
    ],
    otherwise: [{ kind: 'get', fn: 'first', from: 'found', index: null, as: 'top' }],
  },
  { kind: 'say', text: '{excuse}' },
];

/** The browser's shape and the domain's are the same; the test says so rather than casting blindly. */
const asDomain = (blocks: readonly BlockWire[]): Block[] => blocks as Block[];

describe('toolNameFor', () => {
  it.each(['morning brief', 'News about {topic}!', '  a-b_c 1  '])('names %j exactly as the domain does', (name) => {
    expect(toolNameFor(name)).toBe(Shortcut.toolNameFor(name));
  });
});

describe('slotsIn and phraseParts', () => {
  it('lists every slot once, in the order it first appears', () => {
    expect(slotsIn(['news about {topic}', 'news in {region} about {topic}'])).toEqual(['topic', 'region']);
  });

  it('splits a phrase into words and slots', () => {
    expect(phraseParts('news about {topic} today')).toEqual([
      { text: 'news about ', slot: false },
      { text: '{topic}', slot: true },
      { text: ' today', slot: false },
    ]);
  });
});

describe('counting blocks and names', () => {
  it('counts every block and every Ask, inside If blocks too', () => {
    expect(countBlocks(flow)).toBe(6);
    expect(countAsks(flow)).toBe(2);
  });

  it('knows which names hold answers and which hold anything', () => {
    expect(answerNames(flow)).toEqual(['found', 'health']);
    expect(savedNames(flow)).toEqual(['found', 'excuse', 'health', 'top']);
  });
});

describe('insertableTokens', () => {
  it('offers slots, then each answer with its common readings, then the other names', () => {
    expect(insertableTokens(['topic'], flow)).toEqual([
      '{topic}',
      '{found}',
      '{found.count}',
      '{found.titles}',
      '{found.first.title}',
      '{found.first.summary}',
      '{found.first.when}',
      '{health}',
      '{health.count}',
      '{health.titles}',
      '{health.first.title}',
      '{health.first.summary}',
      '{health.first.when}',
      '{excuse}',
      '{top}',
    ]);
  });

  it('only offers what the server accepts', () => {
    const tokens = insertableTokens(['topic'], flow);
    const blocks = asDomain([...flow, { kind: 'say', text: tokens.join(' ') }]);

    expect(
      () => new Shortcut({ name: 'every token', description: '', enabled: true, triggers: ['news about {topic}'], blocks }),
    ).not.toThrow();
  });
});

describe('uniqueName', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(uniqueName('answer', ['found'])).toBe('answer');
    expect(uniqueName('answer', ['answer', 'answer2'])).toBe('answer3');
  });
});

describe('insertText', () => {
  it('puts the token at the caret and moves the caret past it', () => {
    expect(insertText('Hello .', '{person}', 6, 6)).toEqual({ text: 'Hello {person}.', caret: 14 });
  });

  it('replaces a selection', () => {
    expect(insertText('Hello you.', '{person}', 6, 9)).toEqual({ text: 'Hello {person}.', caret: 14 });
  });

  it('keeps a caret past the end at the end', () => {
    expect(insertText('Hi ', '{person}', 99, 99)).toEqual({ text: 'Hi {person}', caret: 11 });
  });
});

describe('starterBlock', () => {
  it('starts an Ask with the first tool that searches, looking for the slot', () => {
    expect(starterBlock('ask', { tools: [status, search], slots: ['topic'], blocks: [] })).toEqual({
      kind: 'ask',
      tool: 'library_search',
      args: { query: '{topic}', limit: 3 },
      as: 'answer',
    });
  });

  it('gives a tool that takes no query no arguments, and a name not already taken', () => {
    const taken: BlockWire[] = [{ kind: 'ask', tool: 'stack_status', args: {}, as: 'answer' }];

    expect(starterBlock('ask', { tools: [status], slots: [], blocks: taken })).toEqual({
      kind: 'ask',
      tool: 'stack_status',
      args: {},
      as: 'answer2',
    });
  });

  it('starts an If on the first answer, or on the slot when nothing was asked yet', () => {
    expect(starterBlock('if', { tools: [], slots: [], blocks: flow })).toMatchObject({
      condition: { kind: 'count', variable: 'found', op: 'is', value: 0 },
    });
    expect(starterBlock('if', { tools: [], slots: ['topic'], blocks: [] })).toMatchObject({
      condition: { kind: 'text', template: '{topic}', op: 'is_not_empty' },
    });
  });

  it('builds blocks that the server accepts once their text is filled in', () => {
    const context = { tools: [search], slots: ['topic'], blocks: [] as BlockWire[] };
    const ask = starterBlock('ask', context);
    context.blocks = [ask];
    const check = starterBlock('if', context);
    const get = starterBlock('get', context);
    context.blocks = [ask, get];
    const set = starterBlock('set', context);

    const blocks = asDomain([
      ask,
      { ...(check as Extract<BlockWire, { kind: 'if' }>), then: [{ kind: 'say', text: 'Nothing about {topic}.' }, { kind: 'stop' }] },
      get,
      { ...(set as Extract<BlockWire, { kind: 'set' }>), to: '{answer.first.title}' },
      { kind: 'say', text: '{value} about {topic}. Newest: {note}.' },
    ]);

    expect(
      () => new Shortcut({ name: 'starters', description: '', enabled: true, triggers: ['news about {topic}'], blocks }),
    ).not.toThrow();
  });
});

describe('describeProblem', () => {
  it.each([
    ['blocks.1.then.0.text: what to say is missing', 'Block 2 › Then › 1: What to say is missing'],
    ['blocks.0.condition.variable: "mood" is not the name an Ask block saved its answer under', 'Block 1: "mood" is not the name an Ask block saved its answer under'],
    ['triggers.1: "{topic}" needs words around its slots', 'Phrase 2: "{topic}" needs words around its slots'],
    ['blocks: has 17 blocks; at most 16 keeps a flow followable', 'This shortcut has 17 blocks; at most 16 keeps a flow followable'],
    ['blocks: a shortcut needs at least one block', 'A shortcut needs at least one block'],
    ['name: "???" does not make a usable tool name.', '"???" does not make a usable tool name.'],
    ['Could not reach the server.', 'Could not reach the server.'],
  ])('says %j as %j', (message, said) => {
    expect(describeProblem(message)).toBe(said);
  });
});
