import { describe, expect, it } from 'vitest';

import { AppRegistryService } from '../../../src/application/app-registry.service.js';
import { ConversationService } from '../../../src/application/conversation.service.js';
import { ShortcutRegistryService } from '../../../src/application/shortcut-registry.service.js';
import { AppDefinition } from '../../../src/domain/app-definition.js';
import {
  DataSource,
  DEFAULT_FIELD_MAP,
  DEFAULT_STATUS_FIELD_MAP,
} from '../../../src/domain/data-source.js';
import { SourceUnavailableError } from '../../../src/domain/errors.js';
import type { ConfigStore } from '../../../src/domain/ports/config-store.js';
import type { ShortcutStore } from '../../../src/domain/ports/shortcut-store.js';
import { Shortcut } from '../../../src/domain/shortcut.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import type { ToolCallOutcome, ToolCaller } from '../../../src/domain/ports/tool-caller.js';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const app = (id: string, label: string) =>
  new AppDefinition({
    id,
    label,
    description: 'd',
    enabled: true,
    primitives: { search: true, read: true, status: true },
    sources: [
      new DataSource({
        id,
        type: 'github-repo',
        label: id,
        repo: 'owner/repo',
        viewsDir: 'data/views',
        statsFile: 'data/views/stats.json',
        indexFile: 'data/views/index.json',
        itemsPath: null,
        fields: DEFAULT_FIELD_MAP,
        statusFields: DEFAULT_STATUS_FIELD_MAP,
      }),
    ],
  });

/** Records what was called and replies with whatever the test queued. */
class RecordingCaller implements ToolCaller {
  readonly calls: { tool: string; args: Record<string, unknown> }[] = [];

  constructor(private readonly reply: (tool: string) => ToolCallOutcome | Error) {}

  async callTool(tool: string, args: Record<string, unknown>): Promise<ToolCallOutcome> {
    this.calls.push({ tool, args });
    const outcome = this.reply(tool);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}

const outcome = (over: Partial<ToolCallOutcome> = {}): ToolCallOutcome => ({
  spoken: 'here you go',
  structured: null,
  isError: false,
  latencyMs: 12,
  ...over,
});

const store: ConfigStore = {
  listApps: async () => [app('library', 'Deep-dive library'), app('markets', 'Market intelligence')],
};

const shortcutStoreOf = (shortcuts: Shortcut[]): ShortcutStore => ({
  list: async () => shortcuts,
  save: async () => null,
});

const build = async (caller: ToolCaller, shortcuts: Shortcut[] = []): Promise<ConversationService> => {
  const registry = new AppRegistryService(store, silentLogger);
  await registry.load();
  const shortcutRegistry = new ShortcutRegistryService(shortcutStoreOf(shortcuts), silentLogger);
  await shortcutRegistry.load();
  return new ConversationService(registry, caller, shortcutRegistry);
};

describe('ConversationService.respond', () => {
  it('calls the planned tool and speaks what it returned', async () => {
    const caller = new RecordingCaller(() => outcome({ spoken: 'Your stack is healthy.' }));
    const service = await build(caller);

    const turn = await service.respond({ utterance: 'is my stack healthy?', context: {} });

    expect(caller.calls).toEqual([{ tool: 'stack_status', args: {} }]);
    expect(turn.spoken).toBe('Your stack is healthy.');
  });

  it('reports the call it made, so the simulator can show it', async () => {
    const caller = new RecordingCaller(() => outcome({ latencyMs: 42 }));
    const service = await build(caller);

    const turn = await service.respond({ utterance: 'anything about gold', context: {} });

    expect(turn.trace).toEqual({
      tool: 'library_search',
      args: { query: 'gold', limit: 3 },
      latencyMs: 42,
      isError: false,
    });
  });

  it('remembers the first search hit so a follow-up can read it', async () => {
    const caller = new RecordingCaller(() =>
      outcome({ structured: { items: [{ key: '2026-09-01-003' }, { key: 'other' }] } }),
    );
    const service = await build(caller);

    const turn = await service.respond({ utterance: 'anything about gold', context: {} });

    expect(turn.context).toEqual({ lastKey: '2026-09-01-003', lastAppId: 'library' });
  });

  it('keeps the key and its app together when a later turn returns neither', async () => {
    const caller = new RecordingCaller((tool) =>
      tool.endsWith('_status') ? outcome() : outcome({ structured: { items: [{ key: 'evt-1' }] } }),
    );
    const service = await build(caller);

    const first = await service.respond({ utterance: 'anything on Iran in my markets', context: {} });
    const second = await service.respond({ utterance: 'did my library run last night?', context: first.context });

    // A status call must not re-point the app while leaving the old key behind.
    expect(second.context).toEqual({ lastKey: 'evt-1', lastAppId: 'markets' });
  });

  it('follows up against the app the key came from', async () => {
    const caller = new RecordingCaller(() => outcome({ structured: { item: { key: 'evt-1' } } }));
    const service = await build(caller);

    await service.respond({
      utterance: 'tell me more',
      context: { lastKey: 'evt-1', lastAppId: 'markets' },
    });

    expect(caller.calls).toEqual([{ tool: 'markets_read', args: { key: 'evt-1' } }]);
  });

  it('routes a shortcut by the name a person would say', async () => {
    const caller = new RecordingCaller(() => outcome({ spoken: 'Here is your brief.' }));
    const brief = new Shortcut({
      name: 'morning brief',
      description: 'd',
      enabled: true,
      reply: '',
      steps: [{ tool: 'stack_status', args: {} }],
    });
    const service = await build(caller, [brief]);

    const turn = await service.respond({ utterance: "what's my morning brief?", context: {} });

    expect(caller.calls).toEqual([{ tool: 'morning_brief', args: {} }]);
    expect(turn.spoken).toBe('Here is your brief.');
  });

  it('answers without calling anything when the request is unclear', async () => {
    const caller = new RecordingCaller(() => outcome());
    const service = await build(caller);

    const turn = await service.respond({ utterance: '  ', context: {} });

    expect(caller.calls).toEqual([]);
    expect(turn.trace).toBeNull();
  });

  it('lets a transport failure surface as a typed error', async () => {
    const caller = new RecordingCaller(() => new SourceUnavailableError('mcp', 'could not call'));
    const service = await build(caller);

    await expect(
      service.respond({ utterance: 'is my stack healthy?', context: {} }),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});
