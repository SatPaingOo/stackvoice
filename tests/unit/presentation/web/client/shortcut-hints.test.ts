import { describe, expect, it } from 'vitest';

import { Shortcut } from '../../../../../src/domain/shortcut.js';
import { parseArgs, toolNameFor } from '../../../../../src/presentation/web/client/shortcuts/shortcut-hints.js';

describe('toolNameFor', () => {
  it.each(['morning brief', 'Market check!', '  news about AI  ', 'a-b_c 1'])(
    'names %s exactly as the domain does',
    (name) => {
      expect(toolNameFor(name)).toBe(Shortcut.toolNameFor(name));
    },
  );
});

describe('parseArgs', () => {
  it('reads a JSON object', () => {
    expect(parseArgs('{"limit": 2, "query": "gold"}')).toEqual({ ok: true, args: { limit: 2, query: 'gold' } });
  });

  it('treats an empty box as no arguments', () => {
    expect(parseArgs('   ')).toEqual({ ok: true, args: {} });
  });

  it('refuses text that is not JSON', () => {
    expect(parseArgs('{limit: 2}')).toEqual({ ok: false, problem: 'is not valid JSON' });
  });

  it.each(['[1, 2]', '"gold"', '2', 'null'])('refuses %s, which is JSON but not an object', (text) => {
    expect(parseArgs(text).ok).toBe(false);
  });
});
