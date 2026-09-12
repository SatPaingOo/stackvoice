import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/domain/errors.js';
import type { Block } from '../../../src/domain/flow.js';
import { Shortcut, type ShortcutProps } from '../../../src/domain/shortcut.js';

const ask = (tool: string, as: string, args: Record<string, string | number> = {}): Block => ({
  kind: 'ask',
  tool,
  args,
  as,
});

const props = (over: Partial<ShortcutProps> = {}): ShortcutProps => ({
  name: 'morning brief',
  description: 'Latest items plus stack health.',
  enabled: true,
  triggers: [],
  blocks: [ask('library_search', 'news', { limit: 2 })],
  ...over,
});

describe('tool name', () => {
  it.each([
    ['morning brief', 'morning_brief'],
    ["What's new?", 'what_s_new'],
    ['  Market   Check  ', 'market_check'],
    ['brief-2', 'brief_2'],
  ])('turns %j into %j', (name, expected) => {
    expect(Shortcut.toolNameFor(name)).toBe(expected);
  });

  it('is what the entity exposes', () => {
    expect(new Shortcut(props({ name: 'Market Check' })).toolName).toBe('market_check');
  });
});

describe('invariants', () => {
  it('rejects an empty name', () => {
    expect(() => new Shortcut(props({ name: '   ' }))).toThrowError(ValidationError);
  });

  it('rejects a name that cannot become a tool', () => {
    expect(() => new Shortcut(props({ name: '???' }))).toThrowError(/usable tool name/);
  });

  it('rejects a name that starts with a digit, because tool names cannot', () => {
    expect(() => new Shortcut(props({ name: '2nd brief' }))).toThrowError(/usable tool name/);
  });

  it('rejects a shortcut with no blocks', () => {
    expect(() => new Shortcut(props({ blocks: [] }))).toThrowError(/at least one block/);
  });

  it('rejects a flow that does not hold together, naming the field', () => {
    expect(() => new Shortcut(props({ blocks: [{ kind: 'say', text: '{nobody}' }] }))).toThrowError(/blocks\.0\.text/);
  });

  it('trims the name it stores', () => {
    expect(new Shortcut(props({ name: '  morning brief  ' })).name).toBe('morning brief');
  });
});

describe('phrases and slots', () => {
  it('uses its name as the phrase when none are written', () => {
    const shortcut = new Shortcut(props());

    expect(shortcut.phrases()).toEqual(['morning brief']);
    expect(shortcut.slots).toEqual([]);
  });

  it('takes its slots from its phrases', () => {
    const shortcut = new Shortcut(
      props({
        triggers: ['news about {topic}', 'anything on {topic}'],
        blocks: [ask('library_search', 'found', { query: '{topic}' })],
      }),
    );

    expect(shortcut.phrases()).toEqual(['news about {topic}', 'anything on {topic}']);
    expect(shortcut.slots).toEqual(['topic']);
  });

  it('tidies its phrases and drops empty ones', () => {
    const shortcut = new Shortcut(props({ triggers: ['  news   about {topic} ', '   '], blocks: [ask('library_search', 'found')] }));

    expect(shortcut.triggers).toEqual(['news about {topic}']);
  });
});

describe('requiredTools', () => {
  it('lists each tool once, in order, including the ones inside an If', () => {
    const shortcut = new Shortcut(
      props({
        blocks: [
          ask('library_search', 'a'),
          {
            kind: 'if',
            condition: { kind: 'failed', variable: 'a' },
            then: [ask('stack_status', 'b'), ask('library_search', 'c')],
            otherwise: [],
          },
        ],
      }),
    );

    expect(shortcut.requiredTools()).toEqual(['library_search', 'stack_status']);
  });
});
