import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppRegistryService } from '../../../src/application/app-registry.service.js';
import { ShortcutRegistryService } from '../../../src/application/shortcut-registry.service.js';
import { ShortcutService } from '../../../src/application/shortcut.service.js';
import { ToolCatalogService } from '../../../src/application/tool-catalog.service.js';
import type { ToolOutput, ToolRunner } from '../../../src/application/tool-runner.service.js';
import type { ConfigStore } from '../../../src/domain/ports/config-store.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import { Shortcut } from '../../../src/domain/shortcut.js';
import { createMcpServer } from '../../../src/presentation/mcp/server-factory.js';
import { ToolMapper } from '../../../src/presentation/mcp/tool-mapper.js';

/**
 * Shortcut tools as an MCP client sees them, over the SDK's in-memory transport:
 * what the tool list advertises, and what reaches the flow when a client calls.
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

class FakeRunner {
  readonly calls: { tool: string; args: Readonly<Record<string, unknown>> }[] = [];

  async run(tool: string, args: Readonly<Record<string, unknown>> = {}): Promise<ToolOutput> {
    this.calls.push({ tool, args });
    return {
      spoken: 'One entry.',
      structured: { items: [{ key: 'k1', title: 'Gold rises', summary: null, date: null, topic: null, region: null, url: null }] },
    };
  }
}

const news = new Shortcut({
  name: 'news about topic',
  description: 'What the library has on a subject.',
  enabled: true,
  triggers: ['news about {topic}'],
  blocks: [
    { kind: 'ask', tool: 'library_search', args: { query: '{topic}', limit: 2 }, as: 'found' },
    { kind: 'say', text: 'Found {found.count} about {topic}: {found.first.title}.' },
  ],
});

const brief = new Shortcut({
  name: 'morning brief',
  description: 'The brief.',
  enabled: true,
  triggers: [],
  blocks: [{ kind: 'say', text: 'Good morning.' }],
});

let runner: FakeRunner;
let client: Client;
let close: () => Promise<void>;

beforeEach(async () => {
  runner = new FakeRunner();
  const registry = new AppRegistryService({ listApps: async () => [] } as unknown as ConfigStore, silentLogger);
  await registry.load();
  const shortcuts = new ShortcutRegistryService({ list: async () => [news, brief], save: async () => null }, silentLogger);
  await shortcuts.load();

  const toolRunner = runner as unknown as ToolRunner;
  const mapper = new ToolMapper({
    runner: toolRunner,
    shortcuts,
    shortcutService: new ShortcutService(toolRunner, silentLogger, () => new Date('2026-09-13T10:00:00Z')),
    logger: silentLogger,
  });
  const server = createMcpServer({
    version: 'test',
    registry,
    shortcuts,
    catalog: new ToolCatalogService(),
    mapper,
    logger: silentLogger,
  });

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  close = async () => {
    await client.close();
    await server.close();
  };
});

afterEach(async () => {
  await close();
});

describe('shortcut tools over MCP', () => {
  it('publishes each slot as a required text input, and nothing for a shortcut without slots', async () => {
    const { tools } = await client.listTools();
    const newsTool = tools.find((tool) => tool.name === 'news_about_topic');
    const briefTool = tools.find((tool) => tool.name === 'morning_brief');

    expect(newsTool?.inputSchema.properties).toHaveProperty('topic');
    expect(newsTool?.inputSchema.required).toEqual(['topic']);
    expect(newsTool?.description).toContain('"news about {topic}"');
    expect(Object.keys(briefTool?.inputSchema.properties ?? {})).toEqual([]);
  });

  it('runs the flow with what the client filled in', async () => {
    const result = await client.callTool({ name: 'news_about_topic', arguments: { topic: 'gold' } });

    expect(runner.calls).toEqual([{ tool: 'library_search', args: { query: 'gold', limit: 2 } }]);
    expect(result.content).toEqual([{ type: 'text', text: 'Found 1 about gold: Gold rises.' }]);
  });

  it('refuses a call without the slot instead of running the flow about nothing', async () => {
    const outcome = await client
      .callTool({ name: 'news_about_topic', arguments: {} })
      .then((result) => result.isError === true)
      .catch(() => true);

    expect(outcome).toBe(true);
    expect(runner.calls).toEqual([]);
  });

  it('runs a shortcut without slots as before', async () => {
    const result = await client.callTool({ name: 'morning_brief', arguments: {} });

    expect(result.content).toEqual([{ type: 'text', text: 'Good morning.' }]);
  });
});
