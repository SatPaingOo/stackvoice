import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { AppRegistryService } from '../../application/app-registry.service.js';
import type { HealthService } from '../../application/health.service.js';
import type { ReadService } from '../../application/read.service.js';
import {
  shapeAppHealth,
  shapeItem,
  shapeSearchResults,
  shapeStackHealth,
} from '../../application/response-shaper.js';
import type { SearchService } from '../../application/search.service.js';
import type { StatusService } from '../../application/status.service.js';
import { StackVoiceError } from '../../domain/errors.js';
import { SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX } from '../../domain/item.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ToolSpec } from '../../domain/tool-spec.js';

export interface ToolMapperDeps {
  readonly registry: AppRegistryService;
  readonly search: SearchService;
  readonly read: ReadService;
  readonly status: StatusService;
  readonly health: HealthService;
  readonly logger: Logger;
  readonly now: () => Date;
}

type TextContent = { type: 'text'; text: string };
type ToolResult = {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const itemShape = {
  key: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  date: z.string().nullable(),
  topic: z.string().nullable(),
  region: z.string().nullable(),
  url: z.string().nullable(),
};

const sourceHealthShape = {
  sourceId: z.string(),
  ok: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastDataDate: z.string().nullable(),
  itemCount: z.number().nullable(),
  latencyMs: z.number().nullable(),
  lastError: z.string().nullable(),
};

/**
 * Maps a neutral `ToolSpec` onto an MCP registration.
 *
 * The MCP SDK stops here: application services never see a tool result shape,
 * and this file holds no business logic. It is also the single place where a
 * typed domain error becomes an MCP error result.
 */
export class ToolMapper {
  constructor(private readonly deps: ToolMapperDeps) {}

  register(server: McpServer, spec: ToolSpec): void {
    switch (spec.verb) {
      case 'stack_status':
        return this.registerStackStatus(server, spec);
      case 'search':
        return this.registerSearch(server, spec);
      case 'read':
        return this.registerRead(server, spec);
      case 'status':
        return this.registerStatus(server, spec);
    }
  }

  private registerStackStatus(server: McpServer, spec: ToolSpec): void {
    server.registerTool(
      spec.name,
      { title: spec.title, description: spec.description },
      async () =>
        this.guard(spec.name, async () => {
          const health = await this.deps.health.reportStack();
          return {
            content: [{ type: 'text', text: shapeStackHealth(health) }],
            structuredContent: asRecord(health),
          };
        }),
    );
  }

  private registerSearch(server: McpServer, spec: ToolSpec): void {
    const appId = spec.appId as string;
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: {
          query: z.string().optional().describe('Words to look for in entry titles and summaries.'),
          topic: z.string().optional().describe('Narrow to one topic, when the app classifies entries by topic.'),
          region: z.string().optional().describe('Narrow to one region, when the app classifies entries by region.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(SEARCH_LIMIT_MAX)
            .default(SEARCH_LIMIT_DEFAULT)
            .describe('How many entries to return, at most ' + String(SEARCH_LIMIT_MAX) + '.'),
        },
        outputSchema: { items: z.array(z.object(itemShape)) },
      },
      async (args) =>
        this.guard(spec.name, async () => {
          const params = {
            query: args.query,
            topic: args.topic,
            region: args.region,
            limit: args.limit ?? SEARCH_LIMIT_DEFAULT,
          };
          const items = await this.deps.search.search(appId, params);
          const label = this.deps.registry.get(appId).label;
          return {
            content: [{ type: 'text', text: shapeSearchResults(label, items, params) }],
            structuredContent: { items: [...items] } as Record<string, unknown>,
          };
        }),
    );
  }

  private registerRead(server: McpServer, spec: ToolSpec): void {
    const appId = spec.appId as string;
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: {
          key: z.string().min(1).describe('The key of the entry, as returned by the matching search tool.'),
        },
        outputSchema: { found: z.boolean(), item: z.object(itemShape).nullable() },
      },
      async (args) =>
        this.guard(spec.name, async () => {
          const item = await this.deps.read.read(appId, args.key);
          const label = this.deps.registry.get(appId).label;
          const text =
            item === null ? 'Your ' + label + ' has no entry with that key.' : shapeItem(item);
          return {
            content: [{ type: 'text', text }],
            structuredContent: { found: item !== null, item } as Record<string, unknown>,
          };
        }),
    );
  }

  private registerStatus(server: McpServer, spec: ToolSpec): void {
    const appId = spec.appId as string;
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        outputSchema: {
          appId: z.string(),
          enabled: z.boolean(),
          ok: z.boolean(),
          sources: z.array(z.object(sourceHealthShape)),
        },
      },
      async () =>
        this.guard(spec.name, async () => {
          const health = await this.deps.status.statusOf(appId);
          const label = this.deps.registry.get(appId).label;
          return {
            content: [{ type: 'text', text: shapeAppHealth(label, health, this.deps.now()) }],
            structuredContent: asRecord(health),
          };
        }),
    );
  }

  /**
   * The one place a failure becomes a tool result. Typed domain errors speak for
   * themselves; anything else is logged and reported without leaking internals.
   */
  private async guard(tool: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
    const started = Date.now();
    try {
      const result = await run();
      this.deps.logger.debug('tool ok', { tool, ms: Date.now() - started });
      return result;
    } catch (error) {
      const message =
        error instanceof StackVoiceError
          ? error.message
          : 'That did not work. Please try again in a moment.';
      this.deps.logger.warn('tool failed', {
        tool,
        ms: Date.now() - started,
        code: error instanceof StackVoiceError ? error.code : 'UNKNOWN',
      });
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
}

/** Structured content must be a plain record; the domain models already are. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
