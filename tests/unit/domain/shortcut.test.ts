import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../src/domain/errors.js';
import { renderReply, Shortcut, type ShortcutProps } from '../../../src/domain/shortcut.js';

const props = (over: Partial<ShortcutProps> = {}): ShortcutProps => ({
  name: 'morning brief',
  description: 'Latest items plus stack health.',
  enabled: true,
  reply: '',
  steps: [{ tool: 'library_search', args: { limit: 2 } }],
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

  it('rejects a shortcut with no steps', () => {
    expect(() => new Shortcut(props({ steps: [] }))).toThrowError(/no steps/);
  });

  it('rejects more steps than an answer can carry', () => {
    const steps = Array.from({ length: 5 }, () => ({ tool: 'stack_status', args: {} }));

    expect(() => new Shortcut(props({ steps }))).toThrowError(/at most 4/);
  });

  it('rejects a step with no tool', () => {
    expect(() => new Shortcut(props({ steps: [{ tool: '  ', args: {} }] }))).toThrowError(/no tool/);
  });

  it('trims the name it stores', () => {
    expect(new Shortcut(props({ name: '  morning brief  ' })).name).toBe('morning brief');
  });
});

describe('requiredTools', () => {
  it('lists each tool once, in order', () => {
    const shortcut = new Shortcut(
      props({
        steps: [
          { tool: 'library_search', args: {} },
          { tool: 'stack_status', args: {} },
          { tool: 'library_search', args: {} },
        ],
      }),
    );

    expect(shortcut.requiredTools()).toEqual(['library_search', 'stack_status']);
  });
});

describe('renderReply', () => {
  it('joins the answers when there is no template', () => {
    expect(renderReply('', ['One.', 'Two.'])).toBe('One. Two.');
  });

  it('fills {results} with everything', () => {
    expect(renderReply('Here you go: {results}', ['One.', 'Two.'])).toBe('Here you go: One. Two.');
  });

  it('fills numbered placeholders with individual steps', () => {
    expect(renderReply('{2} And before that, {1}', ['One.', 'Two.'])).toBe('Two. And before that, One.');
  });

  it('leaves an out-of-range placeholder empty rather than printing a marker', () => {
    expect(renderReply('{1} {9}', ['One.'])).toBe('One.');
  });

  it('skips an empty answer when joining', () => {
    expect(renderReply('', ['One.', '   ', 'Three.'])).toBe('One. Three.');
  });

  it('collapses the whitespace a template leaves behind', () => {
    expect(renderReply('  {1}    {2}  ', ['One.', 'Two.'])).toBe('One. Two.');
  });
});
