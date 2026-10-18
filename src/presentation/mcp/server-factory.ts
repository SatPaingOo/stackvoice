import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolCatalogService } from '../../application/tool-catalog.service.js';
import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import type { Logger } from '../../domain/ports/logger.js';
import { ANSWER_CARD_HTML, ANSWER_CARD_MIME, ANSWER_CARD_URI } from './answer-card.js';
import { ToolMapper } from './tool-mapper.js';

export interface McpServerDeps {
  readonly version: string;
  readonly registry: AppRegistryService;
  readonly shortcuts: ShortcutRegistryService;
  readonly catalog: ToolCatalogService;
  readonly mapper: ToolMapper;
  readonly logger: Logger;
}

/**
 * Builds one configured `McpServer` per session.
 *
 * Every tool comes from the catalog, which derives them from config — adding an
 * app changes what this function registers without changing this function.
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({ name: 'stackvoice', version: deps.version }, { capabilities: { tools: {} } });

  // The card that search, read and whats_new results can be shown in, for hosts that support MCP Apps.
  server.registerResource(
    'answer-card',
    ANSWER_CARD_URI,
    {
      title: 'StackVoice answer',
      description: 'Shows the entries behind a spoken answer, for a host with a screen.',
      mimeType: ANSWER_CARD_MIME,
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: ANSWER_CARD_MIME, text: ANSWER_CARD_HTML, _meta: { ui: { prefersBorder: true } } },
      ],
    }),
  );

  const specs = deps.catalog.generate(deps.registry.list(), deps.shortcuts.list());
  for (const spec of specs) {
    deps.mapper.register(server, spec);
  }

  deps.logger.debug('tools registered', { count: specs.length, tools: specs.map((spec) => spec.name) });
  return server;
}
