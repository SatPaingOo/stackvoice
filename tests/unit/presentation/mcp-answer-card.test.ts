import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppRegistryService } from '../../../src/application/app-registry.service.js';
import { ShortcutRegistryService } from '../../../src/application/shortcut-registry.service.js';
import { ShortcutService } from '../../../src/application/shortcut.service.js';
import { ToolCatalogService } from '../../../src/application/tool-catalog.service.js';
import type { ToolOutput, ToolRunner } from '../../../src/application/tool-runner.service.js';
import { AppDefinition } from '../../../src/domain/app-definition.js';
import { DataSource, DEFAULT_FIELD_MAP, DEFAULT_STATUS_FIELD_MAP } from '../../../src/domain/data-source.js';
import type { ConfigStore } from '../../../src/domain/ports/config-store.js';
import type { Logger } from '../../../src/domain/ports/logger.js';
import { ANSWER_CARD_MIME, ANSWER_CARD_URI } from '../../../src/presentation/mcp/answer-card.js';
import { createMcpServer } from '../../../src/presentation/mcp/server-factory.js';
import { ToolMapper } from '../../../src/presentation/mcp/tool-mapper.js';

/**
 * The answer card as an MCP Apps host sees it: which tools link to it, and the
 * view a host fetches with resources/read.
 */

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

const library = new AppDefinition({
  id: 'library',
  label: 'Library',
  description: 'Articles.',
  enabled: true,
  primitives: { search: true, read: true, status: true },
  sources: [
    new DataSource({
      id: 'library',
      type: 'github-repo',
      label: 'library',
      repo: 'owner/name',
      viewsDir: 'data/views',
      statsFile: 'data/views/stats.json',
      indexFile: 'data/views/index.json',
      itemsPath: null,
      fields: DEFAULT_FIELD_MAP,
      statusFields: DEFAULT_STATUS_FIELD_MAP,
    }),
  ],
});

let client: Client;
let close: () => Promise<void>;

beforeEach(async () => {
  const registry = new AppRegistryService({ listApps: async () => [library] } as unknown as ConfigStore, silentLogger);
  await registry.load();
  const shortcuts = new ShortcutRegistryService({ list: async () => [], save: async () => null }, silentLogger);
  await shortcuts.load();

  const runner = {
    run: async (): Promise<ToolOutput> => ({ spoken: 'Nothing.', structured: null }),
  } as unknown as ToolRunner;
  const server = createMcpServer({
    version: 'test',
    registry,
    shortcuts,
    catalog: new ToolCatalogService(),
    mapper: new ToolMapper({
      runner,
      shortcuts,
      shortcutService: new ShortcutService(runner, silentLogger, () => new Date('2026-10-18T10:00:00Z')),
      logger: silentLogger,
    }),
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

describe('the answer card (MCP Apps)', () => {
  it('links the tools whose results are entries to the card, and no others', async () => {
    const { tools } = await client.listTools();
    const linked = tools
      .filter(
        (tool) => (tool._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri === ANSWER_CARD_URI,
      )
      .map((tool) => tool.name);

    expect(linked.sort()).toEqual(['library_read', 'library_search', 'whats_new']);
  });

  it('serves the card as one HTML document with the MCP Apps type', async () => {
    const { contents } = await client.readResource({ uri: ANSWER_CARD_URI });
    const card = contents[0] as { uri: string; mimeType: string; text: string; _meta?: unknown };

    expect(card.uri).toBe(ANSWER_CARD_URI);
    expect(card.mimeType).toBe(ANSWER_CARD_MIME);
    expect(card.text).toMatch(/^<!doctype html>/);
    expect(card.text).toContain("'ui/initialize'");
    expect(card.text).toContain('ui/notifications/tool-result');
    expect(card._meta).toEqual({ ui: { prefersBorder: true } });
  });

  it('loads nothing from outside and never writes data into the page as HTML', async () => {
    const { contents } = await client.readResource({ uri: ANSWER_CARD_URI });
    const html = (contents[0] as { text: string }).text;

    expect(html).not.toMatch(/\b(src|href)=["']https?:/);
    expect(html).not.toContain('innerHTML');
  });
});
