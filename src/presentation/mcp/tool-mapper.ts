import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { ShortcutRegistryService } from '../../application/shortcut-registry.service.js';
import type { ShortcutService } from '../../application/shortcut.service.js';
import type { ToolRunner } from '../../application/tool-runner.service.js';
import { StackVoiceError } from '../../domain/errors.js';
import { SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX } from '../../domain/item.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ToolSpec } from '../../domain/tool-spec.js';

export interface ToolMapperDeps {
  readonly runner: ToolRunner;
  readonly shortcuts: ShortcutRegistryService;
  readonly shortcutService: ShortcutService;
  readonly logger: Logger;
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
 * The MCP SDK stops here. Running a tool is `ToolRunner`'s job, so this file
 * holds only the translation — the input schema, the result shape, and the
 * single place where a typed domain error becomes an MCP error result.
 */
export class ToolMapper {
  constructor(private readonly deps: ToolMapperDeps) {}

  register(server: McpServer, spec: ToolSpec): void {
    switch (spec.verb) {
      case 'stack_status':
        return this.registerNoArgs(server, spec);
      case 'status':
        return this.registerNoArgs(server, spec, {
          appId: z.string(),
          enabled: z.boolean(),
          ok: z.boolean(),
          sources: z.array(z.object(sourceHealthShape)),
        });
      case 'search':
        return this.registerSearch(server, spec);
      case 'read':
        return this.registerRead(server, spec);
      case 'shortcut':
        return this.registerShortcut(server, spec);
    }
  }

  private registerNoArgs(
    server: McpServer,
    spec: ToolSpec,
    outputSchema?: Record<string, z.ZodTypeAny>,
  ): void {
    server.registerTool(
      spec.name,
      outputSchema === undefined
        ? { title: spec.title, description: spec.description }
        : { title: spec.title, description: spec.description, outputSchema },
      async () =>
        this.guard(spec.name, async () => {
          const output = await this.deps.runner.run(spec.name);
          return {
            content: [{ type: 'text', text: output.spoken }],
            ...(output.structured === null ? {} : { structuredContent: output.structured }),
          };
        }),
    );
  }

  private registerSearch(server: McpServer, spec: ToolSpec): void {
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
          const output = await this.deps.runner.run(spec.name, args as Record<string, unknown>);
          return {
            content: [{ type: 'text', text: output.spoken }],
            ...(output.structured === null ? {} : { structuredContent: output.structured }),
          };
        }),
    );
  }

  private registerRead(server: McpServer, spec: ToolSpec): void {
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
          const output = await this.deps.runner.run(spec.name, args as Record<string, unknown>);
          return {
            content: [{ type: 'text', text: output.spoken }],
            ...(output.structured === null ? {} : { structuredContent: output.structured }),
          };
        }),
    );
  }

  private registerShortcut(server: McpServer, spec: ToolSpec): void {
    const name = spec.shortcutName as string;
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        outputSchema: {
          steps: z.array(z.object({ tool: z.string(), spoken: z.string(), ok: z.boolean() })),
        },
      },
      async () =>
        this.guard(spec.name, async () => {
          const shortcut = this.deps.shortcuts
            .listEnabled()
            .find((candidate) => candidate.name === name);

          if (shortcut === undefined) {
            return { content: [{ type: 'text', text: 'That shortcut is no longer configured.' }], isError: true };
          }

          const result = await this.deps.shortcutService.run(shortcut);
          return {
            content: [{ type: 'text', text: result.spoken }],
            structuredContent: { steps: [...result.steps] },
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
