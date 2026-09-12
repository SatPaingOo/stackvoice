import { describe, expect, it } from 'vitest';

import { ShortcutService } from '../../../src/application/shortcut.service.js';
import type { ToolOutput, ToolRunner } from '../../../src/application/tool-runner.service.js';
import { SourceUnavailableError } from '../../../src/domain/errors.js';
import { blocksFromSteps, type Block } from '../../../src/domain/flow.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import { Shortcut } from '../../../src/domain/shortcut.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const NOW = new Date('2026-09-13T10:00:00Z');

/** Records every call and answers with whatever the test decides. */
class FakeRunner {
  readonly calls: { tool: string; args: Readonly<Record<string, unknown>> }[] = [];

  constructor(private readonly reply: (tool: string) => ToolOutput | Error) {}

  async run(tool: string, args: Readonly<Record<string, unknown>> = {}): Promise<ToolOutput> {
    this.calls.push({ tool, args });
    const outcome = this.reply(tool);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }

  asRunner(): ToolRunner {
    return this as unknown as ToolRunner;
  }
}

const serviceWith = (runner: FakeRunner): ShortcutService =>
  new ShortcutService(runner.asRunner(), silentLogger, () => NOW);

const flow = (blocks: Block[], triggers: string[] = []): Shortcut =>
  new Shortcut({ name: 'news about topic', description: 'd', enabled: true, triggers, blocks });

const speaks = (text: string): ToolOutput => ({ spoken: text, structured: null });

const found = (...titles: string[]): ToolOutput => ({
  spoken: `${titles.length} entries.`,
  structured: {
    items: titles.map((title, index) => ({
      key: `k${index}`,
      title,
      summary: null,
      date: '2026-09-12',
      topic: null,
      region: null,
      url: null,
    })),
  },
});

const search = (as = 'found', args: Record<string, string | number> = { query: '{topic}', limit: 3 }): Block => ({
  kind: 'ask',
  tool: 'library_search',
  args,
  as,
});
const say = (text: string): Block => ({ kind: 'say', text });
const nothingFound: Block = {
  kind: 'if',
  condition: { kind: 'count', variable: 'found', op: 'is', value: 0 },
  then: [say('Nothing about {topic} yet.'), { kind: 'stop' }],
  otherwise: [],
};

describe('ShortcutService.run', () => {
  it('fills a slot into the tool call and into what it says', async () => {
    const runner = new FakeRunner(() => found('Gold rises.', 'Gold falls'));

    const result = await serviceWith(runner).run(
      flow([search(), say('{found.count} about {topic}: {found.titles}.')], ['news about {topic}']),
      { topic: ' gold ' },
    );

    expect(runner.calls).toEqual([{ tool: 'library_search', args: { query: 'gold', limit: 3 } }]);
    expect(result.spoken).toBe('2 about gold: Gold rises and Gold falls.');
  });

  it('leaves out an argument whose slot was not filled, so the search is not for nothing', async () => {
    const runner = new FakeRunner(() => found('Anything'));

    await serviceWith(runner).run(flow([search()], ['news about {topic}']), {});

    expect(runner.calls[0]?.args).toEqual({ limit: 3 });
  });

  it('takes Then when the check holds, and carries on past the If otherwise', async () => {
    const empty = new FakeRunner(() => found());
    const full = new FakeRunner(() => found('Gold rises'));
    const shortcut = flow([search(), nothingFound, say('Newest: {found.first.title}.')], ['news about {topic}']);

    expect((await serviceWith(empty).run(shortcut, { topic: 'gold' })).spoken).toBe('Nothing about gold yet.');
    expect((await serviceWith(full).run(shortcut, { topic: 'gold' })).spoken).toBe('Newest: Gold rises.');
  });

  it('stops at a Stop block, and nothing after it runs', async () => {
    const runner = new FakeRunner(() => speaks('All healthy.'));
    const shortcut = flow([say('One.'), { kind: 'stop' }, { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' }, say('Two.')]);

    const result = await serviceWith(runner).run(shortcut);

    expect(result.spoken).toBe('One.');
    expect(runner.calls).toEqual([]);
    expect(result.trace.map((entry) => entry.kind)).toEqual(['say', 'stop']);
  });

  it('saves what Get and Set produce for later blocks', async () => {
    const runner = new FakeRunner(() => found('First', 'Second', 'Third'));
    const shortcut = flow([
      search('found', { limit: 3 }),
      { kind: 'get', fn: 'item', from: 'found', index: 2, as: 'second' },
      { kind: 'set', name: 'line', to: 'Number two is {second.title}' },
      say('{line}, from {second.when}.'),
    ]);

    expect((await serviceWith(runner).run(shortcut)).spoken).toBe('Number two is Second, from yesterday.');
  });

  it('keeps going when a tool fails, and lets an If speak around it', async () => {
    const runner = new FakeRunner((tool) =>
      tool === 'library_search' ? new SourceUnavailableError('library', 'network down') : speaks('All healthy.'),
    );
    const shortcut = flow([
      search('found', { limit: 2 }),
      { kind: 'if', condition: { kind: 'failed', variable: 'found' }, then: [say('The library is down.')], otherwise: [] },
      { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' },
      say('{health}'),
    ]);

    const result = await serviceWith(runner).run(shortcut);

    expect(result.spoken).toBe('The library is down. All healthy.');
    expect(result.steps.map((step) => step.ok)).toEqual([false, true]);
    expect(result.trace[0]?.ok).toBe(false);
    expect(result.trace[0]?.summary).toContain('network down');
  });

  it('does not leak an unexpected error into the answer', async () => {
    const runner = new FakeRunner(() => new TypeError('undefined is not a function'));

    const result = await serviceWith(runner).run(flow([search('found', { limit: 2 })]));

    expect(result.spoken).toBe('library_search did not answer.');
  });

  it('answers with what the tools said when no block says anything', async () => {
    const runner = new FakeRunner((tool) => speaks(tool === 'library_search' ? 'Two entries.' : 'All healthy.'));
    const shortcut = flow([search('news', { limit: 2 }), { kind: 'ask', tool: 'stack_status', args: {}, as: 'health' }]);

    expect((await serviceWith(runner).run(shortcut)).spoken).toBe('Two entries. All healthy.');
  });

  it('runs a shortcut written before flows exactly as it used to', async () => {
    const runner = new FakeRunner((tool) => speaks(tool === 'library_search' ? 'Two entries.' : 'All healthy.'));
    const legacy = flow(
      blocksFromSteps(
        [
          { tool: 'library_search', args: { limit: 2 } },
          { tool: 'stack_status', args: {} },
        ],
        'Brief: {2} Then: {1}',
      ),
    );

    const result = await serviceWith(runner).run(legacy);

    expect(runner.calls.map((call) => call.tool)).toEqual(['library_search', 'stack_status']);
    expect(result.spoken).toBe('Brief: All healthy. Then: Two entries.');
  });

  it('traces every block that ran, and where it sits', async () => {
    const runner = new FakeRunner(() => found());
    const shortcut = flow([search(), nothingFound, say('never said')], ['news about {topic}']);

    const result = await serviceWith(runner).run(shortcut, { topic: 'gold' });

    expect(result.trace.map((entry) => [entry.at, entry.kind, entry.ok])).toEqual([
      ['1', 'ask', true],
      ['2', 'if', true],
      ['2 › Then › 1', 'say', true],
      ['2 › Then › 2', 'stop', true],
    ]);
    expect(result.trace[0]?.summary).toContain('Asked library_search with query "gold", limit 3, saved as found');
    expect(result.trace[1]?.summary).toBe('Does found have exactly 0? It has 0: yes, so Then ran.');
  });

  it('says so when a flow finishes with nothing to say', async () => {
    const runner = new FakeRunner(() => speaks(''));

    const result = await serviceWith(runner).run(flow([{ kind: 'set', name: 'quiet', to: '' }]));

    expect(result.spoken).toBe('That shortcut finished without anything to say.');
  });
});
