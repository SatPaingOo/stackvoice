import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/domain/errors.js';
import {
  blocksFromSteps,
  MAX_FLOW_ASKS,
  MAX_FLOW_BLOCKS,
  parseBlocks,
  slotsOf,
  validateFlow,
  type Block,
} from '../../../src/domain/flow.js';

const ask = (as = 'found', args: Record<string, string | number> = {}): Block => ({
  kind: 'ask',
  tool: 'library_search',
  args,
  as,
});
const say = (text: string): Block => ({ kind: 'say', text });
const validate = (blocks: Block[], triggers: string[] = []): readonly string[] => validateFlow({ triggers, blocks });

describe('parseBlocks', () => {
  it('reads every kind of block', () => {
    const raw = [
      { kind: 'ask', tool: 'library_search', args: { query: '{topic}', limit: 3 }, as: 'found' },
      {
        kind: 'if',
        condition: { kind: 'count', variable: 'found', op: 'is', value: 0 },
        then: [{ kind: 'say', text: 'Nothing yet.' }, { kind: 'stop' }],
      },
      { kind: 'get', fn: 'item', from: 'found', index: 2, as: 'second' },
      { kind: 'set', name: 'line', to: 'Second is {second.title}' },
      {
        kind: 'if',
        condition: { kind: 'text', template: '{line}', op: 'is_empty' },
        otherwise: [{ kind: 'say', text: '{line}' }],
      },
      { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [{ kind: 'say', text: 'Down.' }] },
    ];

    expect(parseBlocks(raw)).toEqual([
      { kind: 'ask', tool: 'library_search', args: { query: '{topic}', limit: 3 }, as: 'found' },
      {
        kind: 'if',
        condition: { kind: 'count', variable: 'found', op: 'is', value: 0 },
        then: [{ kind: 'say', text: 'Nothing yet.' }, { kind: 'stop' }],
        otherwise: [],
      },
      { kind: 'get', fn: 'item', from: 'found', index: 2, as: 'second' },
      { kind: 'set', name: 'line', to: 'Second is {second.title}' },
      {
        kind: 'if',
        condition: { kind: 'text', template: '{line}', op: 'is_empty', value: '' },
        then: [],
        otherwise: [{ kind: 'say', text: '{line}' }],
      },
      {
        kind: 'if',
        condition: { kind: 'failed', variable: 'found' },
        then: [{ kind: 'say', text: 'Down.' }],
        otherwise: [],
      },
    ]);
  });

  it('names the path of a bad field, however deep it is', () => {
    const raw = [
      { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [{ kind: 'ask', tool: '', as: 'x' }] },
    ];

    expect(() => parseBlocks(raw)).toThrowError(/blocks\.0\.then\.0\.tool/);
  });

  it('refuses a block of a kind that does not exist', () => {
    expect(() => parseBlocks([{ kind: 'loop' }])).toThrowError(/blocks\.0\.kind/);
  });

  it('refuses something that is not a list', () => {
    expect(() => parseBlocks({ kind: 'say', text: 'hi' })).toThrowError(ValidationError);
  });

  it('refuses an argument that is not text, a number, or true or false', () => {
    expect(() => parseBlocks([{ kind: 'ask', tool: 't', args: { limit: { deep: 1 } }, as: 'x' }])).toThrowError(
      /blocks\.0\.args\.limit/,
    );
  });

  it('refuses a variable name a template could not use', () => {
    expect(() => parseBlocks([{ kind: 'ask', tool: 't', as: 'Found Items' }])).toThrowError(/blocks\.0\.as/);
  });

  it('needs something to compare with for contains, and nothing for is_empty', () => {
    expect(() =>
      parseBlocks([{ kind: 'if', condition: { kind: 'text', template: '{x}', op: 'contains' }, then: [] }]),
    ).toThrowError(/condition\.value/);
  });

  it('refuses a count that is not a whole number', () => {
    expect(() =>
      parseBlocks([{ kind: 'if', condition: { kind: 'count', variable: 'x', op: 'is', value: 1.5 }, then: [] }]),
    ).toThrowError(/condition\.value/);
  });
});

describe('slotsOf', () => {
  it('lists the slots in the order a phrase uses them', () => {
    expect(slotsOf('news about {topic} in {region}')).toEqual(['topic', 'region']);
  });
});

describe('validateFlow', () => {
  it('returns the slots the phrases share', () => {
    const slots = validate(
      [ask('found', { query: '{topic}' }), say('{found.count} stories about {topic}. {found.first.title}.')],
      ['news about {topic}', 'anything on {topic}'],
    );

    expect(slots).toEqual(['topic']);
  });

  it('needs at least one block', () => {
    expect(() => validate([])).toThrowError(/at least one block/);
  });

  it('refuses phrases that leave different slots', () => {
    expect(() => validate([say('hi')], ['news about {topic}', 'news in {region}'])).toThrowError(/same slots/);
  });

  it('refuses a phrase that is only a slot, which would match anything', () => {
    expect(() => validate([say('hi')], ['{topic}'])).toThrowError(/needs words/);
  });

  it('refuses a slot that is not a lowercase name', () => {
    expect(() => validate([say('hi')], ['news about {Topic}'])).toThrowError(/lowercase name in braces/);
  });

  it('refuses a name nothing sets, so a typo is caught on save', () => {
    expect(() => validate([ask(), say('{fuond.count} results')])).toThrowError(/\{fuond\} is used/);
  });

  it('refuses a template asking for something a flow cannot read', () => {
    expect(() => validate([ask(), say('{found.colour}')])).toThrowError(/"colour"/);
  });

  it('keeps item for Get blocks, because a template has nowhere to say which one', () => {
    expect(() => validate([ask(), say('{found.item}')])).toThrowError(/"item"/);
  });

  it('refuses counting something no Ask block saved', () => {
    const blocks: Block[] = [
      { kind: 'set', name: 'mood', to: 'good' },
      {
        kind: 'if',
        condition: { kind: 'count', variable: 'mood', op: 'is', value: 0 },
        then: [say('x')],
        otherwise: [],
      },
    ];

    expect(() => validate(blocks)).toThrowError(/not the name an Ask block/);
  });

  it('refuses saving an answer over a slot', () => {
    expect(() => validate([ask('topic')], ['news about {topic}'])).toThrowError(/already a slot/);
  });

  it(`refuses more than ${MAX_FLOW_ASKS} tool calls, counted across branches`, () => {
    const blocks: Block[] = [
      ask('a'),
      ask('b'),
      { kind: 'if', condition: { kind: 'failed', variable: 'a' }, then: [ask('c'), ask('d')], otherwise: [ask('e')] },
    ];

    expect(() => validate(blocks)).toThrowError(/at most 4/);
  });

  it(`refuses more than ${MAX_FLOW_BLOCKS} blocks`, () => {
    expect(() => validate(Array.from({ length: MAX_FLOW_BLOCKS + 1 }, () => say('hi')))).toThrowError(/at most 16/);
  });

  it('allows an If inside an If, and nothing deeper', () => {
    const inner = (then: Block[]): Block => ({
      kind: 'if',
      condition: { kind: 'failed', variable: 'found' },
      then,
      otherwise: [],
    });

    expect(() => validate([ask(), inner([inner([say('two deep')])])])).not.toThrow();
    expect(() => validate([ask(), inner([inner([inner([say('three deep')])])])])).toThrowError(/no deeper/);
  });

  it('refuses an If with nothing under either branch', () => {
    const empty: Block = { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [], otherwise: [] };

    expect(() => validate([ask(), empty])).toThrowError(/needs a block/);
  });

  it('needs to know which entry a Get item block reads', () => {
    expect(() => validate([ask(), { kind: 'get', fn: 'item', from: 'found', index: null, as: 'one' }])).toThrowError(
      /which entry/,
    );
  });

  it('accepts a name set in only one branch, which reads as nothing when the other branch ran', () => {
    const blocks: Block[] = [
      ask(),
      {
        kind: 'if',
        condition: { kind: 'failed', variable: 'found' },
        then: [{ kind: 'set', name: 'excuse', to: 'The library is down.' }],
        otherwise: [],
      },
      say('{excuse} {found.titles}'),
    ];

    expect(() => validate(blocks)).not.toThrow();
  });
});

describe('blocksFromSteps', () => {
  const steps = [
    { tool: 'library_search', args: { limit: 2 } },
    { tool: 'stack_status', args: {} },
  ];

  it('turns each step into an Ask and the reply into a Say', () => {
    expect(blocksFromSteps(steps, 'Brief: {2} Then: {1}')).toEqual([
      { kind: 'ask', tool: 'library_search', args: { limit: 2 }, as: 'step1' },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'step2' },
      { kind: 'say', text: 'Brief: {step2} Then: {step1}' },
    ]);
  });

  it('reads {results} as every answer in order', () => {
    expect(blocksFromSteps(steps, 'Here it is. {results}').at(-1)).toEqual({
      kind: 'say',
      text: 'Here it is. {step1} {step2}',
    });
  });

  it('adds no Say for an empty reply, which is what joining the answers means', () => {
    expect(blocksFromSteps(steps, '  ').map((block) => block.kind)).toEqual(['ask', 'ask']);
  });

  it('drops a placeholder past the last step', () => {
    expect(blocksFromSteps(steps, '{1} {9}').at(-1)).toEqual({ kind: 'say', text: '{step1}' });
  });

  it('keeps only the argument values a block can hold', () => {
    const [first] = blocksFromSteps([{ tool: 't', args: { limit: 2, deep: { a: 1 } } }], '');

    expect(first).toEqual({ kind: 'ask', tool: 't', args: { limit: 2 }, as: 'step1' });
  });

  it('produces a flow that validates', () => {
    expect(() => validate(blocksFromSteps(steps, 'Brief: {results}'))).not.toThrow();
  });
});
