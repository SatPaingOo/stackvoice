import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { HealthService } from '../../application/health.service.js';
import { shapeStackHealth } from '../../application/response-shaper.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface McpServerDeps {
  readonly version: string;
  readonly health: HealthService;
  readonly logger: Logger;
}

/**
 * Builds one configured `McpServer`. The MCP SDK is confined to this layer:
 * application services know nothing about tool registration or result shapes.
 *
 * Stage 1 registers the single global tool. Stage 2 replaces the hard-coded
 * registration with a loop over `ToolSpec`s produced from config.
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer(
    { name: 'stackvoice', version: deps.version },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'stack_status',
    {
      title: 'Stack status',
      description:
        'Report whether the user\'s own data stack is healthy: which apps are configured, whether their most recent runs succeeded, and how fresh the data is. Use when the user asks about the state of their stack, for example "is everything running?" or "did my pipelines work last night?".',
      outputSchema: {
        ok: z.boolean(),
        checkedAt: z.string(),
        version: z.string(),
        uptimeSeconds: z.number(),
        apps: z.array(
          z.object({
            appId: z.string(),
            enabled: z.boolean(),
            ok: z.boolean(),
          }),
        ),
      },
    },
    async () => {
      const health = deps.health.reportStack();
      deps.logger.debug('tool called', { tool: 'stack_status' });
      return {
        content: [{ type: 'text', text: shapeStackHealth(health) }],
        structuredContent: {
          ok: health.ok,
          checkedAt: health.checkedAt,
          version: health.version,
          uptimeSeconds: health.uptimeSeconds,
          apps: health.apps.map((app) => ({
            appId: app.appId,
            enabled: app.enabled,
            ok: app.ok,
          })),
        },
      };
    },
  );

  return server;
}
