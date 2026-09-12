import { describe, expect, it } from 'vitest';

import { ShortcutService } from '../../../src/application/shortcut.service.js';
import type { ToolOutput, ToolRunner } from '../../../src/application/tool-runner.service.js';
import { SourceUnavailableError } from '../../../src/domain/errors.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import { Shortcut, type ShortcutProps } from '../../../src/domain/shortcut.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

/** Records the order tools ran in and answers with whatever the test queued. */
class FakeRunner {
  readonly ran: string[] = [];

  constructor(private readonly reply: (tool: string) => ToolOutput | Error) {}

  async run(tool: string): Promise<ToolOutput> {
    this.ran.push(tool);
    const outcome = this.reply(tool);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }

  asRunner(): ToolRunner {
    return this as unknown as ToolRunner;
  }
}

const shortcut = (over: Partial<ShortcutProps> = {}): Shortcut =>
  new Shortcut({
    name: 'morning brief',
    description: 'd',
    enabled: true,
    reply: '',
    steps: [
      { tool: 'library_search', args: { limit: 2 } },
      { tool: 'stack_status', args: {} },
    ],
    ...over,
  });

const speaks = (text: string): ToolOutput => ({ spoken: text, structured: null });

describe('ShortcutService.run', () => {
  it('runs the steps in the order they were written', async () => {
    const runner = new FakeRunner((tool) => speaks(tool));
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    await service.run(shortcut());

    expect(runner.ran).toEqual(['library_search', 'stack_status']);
  });

  it('joins the answers when there is no template', async () => {
    const runner = new FakeRunner((tool) => speaks(tool === 'library_search' ? 'Two entries.' : 'All healthy.'));
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    expect((await service.run(shortcut())).spoken).toBe('Two entries. All healthy.');
  });

  it('follows the reply template', async () => {
    const runner = new FakeRunner((tool) => speaks(tool === 'library_search' ? 'Two entries.' : 'All healthy.'));
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    const result = await service.run(shortcut({ reply: 'Brief: {2} Then: {1}' }));

    expect(result.spoken).toBe('Brief: All healthy. Then: Two entries.');
  });

  it('reports what each step said, so a caller can show the trace', async () => {
    const runner = new FakeRunner((tool) => speaks(tool));
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    expect((await service.run(shortcut())).steps).toEqual([
      { tool: 'library_search', spoken: 'library_search', ok: true },
      { tool: 'stack_status', spoken: 'stack_status', ok: true },
    ]);
  });

  it('keeps going when a step fails, and says what went wrong', async () => {
    const runner = new FakeRunner((tool) =>
      tool === 'library_search' ? new SourceUnavailableError('library', 'network down') : speaks('All healthy.'),
    );
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    const result = await service.run(shortcut());

    expect(runner.ran).toEqual(['library_search', 'stack_status']);
    expect(result.steps[0]?.ok).toBe(false);
    expect(result.spoken).toContain('network down');
    expect(result.spoken).toContain('All healthy.');
  });

  it('does not leak an unexpected error into the spoken answer', async () => {
    const runner = new FakeRunner(() => new TypeError('undefined is not a function'));
    const service = new ShortcutService(runner.asRunner(), silentLogger);

    const result = await service.run(shortcut({ steps: [{ tool: 'library_search', args: {} }] }));

    expect(result.spoken).toBe('library_search did not answer.');
  });
});
