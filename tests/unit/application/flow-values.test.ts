import { describe, expect, it } from 'vitest';

import {
  applyFunction,
  describeWhen,
  evaluateCondition,
  renderTemplate,
  textOf,
  tidy,
  type FlowValue,
} from '../../../src/application/flow-values.js';
import type { Item } from '../../../src/domain/item.js';

const NOW = new Date('2026-09-13T10:00:00Z');

const item = (n: number, over: Partial<Item> = {}): Item => ({
  key: `k${n}`,
  title: `Story ${n}.`,
  summary: `Summary ${n}`,
  date: '2026-09-12',
  topic: 'world',
  region: 'asia',
  url: `https://example.com/${n}`,
  ...over,
});

const answer = (items: Item[], ok = true): FlowValue => ({ kind: 'answer', spoken: 'The tool said this.', ok, items });
const variables = (entries: Record<string, FlowValue>): Map<string, FlowValue> => new Map(Object.entries(entries));
const text = (value: FlowValue): string => textOf(value);

describe('applyFunction', () => {
  const three = answer([item(1), item(2), item(3)]);

  it('counts the entries in an answer', () => {
    expect(text(applyFunction(three, 'count', null, NOW))).toBe('3');
  });

  it('picks the first, the last, and a numbered entry', () => {
    expect(text(applyFunction(three, 'first', null, NOW))).toBe('Story 1.');
    expect(text(applyFunction(three, 'last', null, NOW))).toBe('Story 3.');
    expect(text(applyFunction(three, 'item', 2, NOW))).toBe('Story 2.');
  });

  it('reads an entry past the end as nothing', () => {
    expect(text(applyFunction(three, 'item', 9, NOW))).toBe('');
  });

  it('lists titles the way they are said, without their full stops', () => {
    expect(text(applyFunction(three, 'titles', null, NOW))).toBe('Story 1, Story 2 and Story 3');
  });

  it('lists no titles as nothing, so an If can check for it', () => {
    expect(text(applyFunction(answer([]), 'titles', null, NOW))).toBe('');
  });

  it('reads a field of an answer from its first entry', () => {
    expect(text(applyFunction(three, 'summary', null, NOW))).toBe('Summary 1');
    expect(text(applyFunction(three, 'link', null, NOW))).toBe('https://example.com/1');
  });

  it('reads a field that is not set as nothing', () => {
    expect(text(applyFunction(answer([item(1, { topic: null })]), 'topic', null, NOW))).toBe('');
  });
});

describe('describeWhen', () => {
  it.each([
    ['2026-09-12', 'yesterday'],
    ['2026-09-13T08:00:00Z', '2 hours ago'],
    ['2026-09-01', 'on September 1'],
    ['2025-12-31', 'on December 31, 2025'],
    ['2026-08', 'in August 2026'],
    ['2026-09-20', 'on September 20'],
    ['next week', 'next week'],
    ['', ''],
  ])('says %j as %j', (raw, spoken) => {
    expect(describeWhen(raw, NOW)).toBe(spoken);
  });
});

describe('renderTemplate', () => {
  const vars = variables({ topic: { kind: 'text', text: 'gold' }, found: answer([item(1), item(2)]) });

  it('fills slots and follows functions through dots', () => {
    // A title inside a sentence loses its own full stop.
    expect(
      renderTemplate(
        '{found.count} stories about {topic}. Newest: {found.first.title}, {found.first.when}.',
        vars,
        NOW,
      ),
    ).toBe('2 stories about gold. Newest: Story 1, yesterday.');
  });

  it('reads an answer on its own as what the tool said', () => {
    expect(renderTemplate('{found}', vars, NOW)).toBe('The tool said this.');
  });

  it('reads a name nothing set as nothing', () => {
    expect(renderTemplate('[{missing}]', vars, NOW)).toBe('[]');
  });

  it('leaves braces that are not a name alone', () => {
    expect(renderTemplate('{Date}: {Price}', vars, NOW)).toBe('{Date}: {Price}');
  });
});

describe('evaluateCondition', () => {
  const vars = variables({
    found: answer([item(1), item(2)]),
    broken: answer([], false),
    line: { kind: 'text', text: 'Gold rises again' },
    topic: { kind: 'text', text: 'GOLD' },
  });

  it.each([
    ['is', 2, true],
    ['is', 0, false],
    ['more_than', 1, true],
    ['less_than', 2, false],
  ] as const)('compares a count with %s %d', (op, value, expected) => {
    expect(evaluateCondition({ kind: 'count', variable: 'found', op, value }, vars, NOW)).toBe(expected);
  });

  it('compares text the way it is heard, ignoring case', () => {
    expect(evaluateCondition({ kind: 'text', template: '{line}', op: 'contains', value: 'gold' }, vars, NOW)).toBe(
      true,
    );
    expect(
      evaluateCondition({ kind: 'text', template: '{line}', op: 'is', value: 'gold rises again' }, vars, NOW),
    ).toBe(true);
  });

  it('fills a template in the value it compares with', () => {
    expect(evaluateCondition({ kind: 'text', template: '{line}', op: 'contains', value: '{topic}' }, vars, NOW)).toBe(
      true,
    );
  });

  it('checks for empty text', () => {
    expect(evaluateCondition({ kind: 'text', template: '{missing}', op: 'is_empty', value: '' }, vars, NOW)).toBe(true);
    expect(evaluateCondition({ kind: 'text', template: '{line}', op: 'is_not_empty', value: '' }, vars, NOW)).toBe(
      true,
    );
  });

  it('never matches contains with nothing to look for', () => {
    expect(evaluateCondition({ kind: 'text', template: '{line}', op: 'contains', value: '{missing}' }, vars, NOW)).toBe(
      false,
    );
  });

  it('knows a failed answer from a successful one, and from one that never ran', () => {
    expect(evaluateCondition({ kind: 'failed', variable: 'broken' }, vars, NOW)).toBe(true);
    expect(evaluateCondition({ kind: 'failed', variable: 'found' }, vars, NOW)).toBe(false);
    expect(evaluateCondition({ kind: 'failed', variable: 'never' }, vars, NOW)).toBe(false);
  });
});

describe('tidy', () => {
  it('closes the gaps an empty slot leaves', () => {
    expect(tidy('  Nothing about   .  Try again ! ')).toBe('Nothing about. Try again!');
  });
});
