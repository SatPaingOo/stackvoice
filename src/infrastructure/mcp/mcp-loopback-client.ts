import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { SourceUnavailableError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ToolCallOutcome, ToolCaller } from '../../domain/ports/tool-caller.js';

export interface McpLoopbackClientOptions {
  /** The server's own public MCP endpoint. */
  readonly endpoint: string;
  /** Bearer token when the server runs in `token` mode. */
  readonly bearerToken: string | null;
  readonly logger: Logger;
}

/**
 * A real MCP client pointed at this server's own Streamable HTTP endpoint.
 *
 * The simulator could have called the application services directly, in the
 * same process, and been simpler. It goes over the wire on purpose: the demo is
 * only honest if the thing being demonstrated is the MCP server, transport,
 * auth and all. If the loopback client can drive it, so can Alexa+.
 *
 * A session is opened per request and ended after. Voice turns are seconds
 * apart, and a fresh session each time keeps the simulator stateless.
 */
export class McpLoopbackClient implements ToolCaller {
  constructor(private readonly options: McpLoopbackClientOptions) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome> {
    const started = Date.now();
    const client = new Client({ name: 'stackvoice-simulator', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.options.endpoint), {
      requestInit:
        this.options.bearerToken === null ? {} : { headers: { authorization: `Bearer ${this.options.bearerToken}` } },
    });

    try {
      await client.connect(transport);
      const result = await client.callTool({ name, arguments: args });

      const content = Array.isArray(result.content) ? result.content : [];
      const first = content.find((part): part is { type: 'text'; text: string } => {
        return typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text';
      });

      return {
        spoken: first?.text ?? 'The tool returned nothing to say.',
        structured: (result.structuredContent as Record<string, unknown> | undefined) ?? null,
        isError: result.isError === true,
        latencyMs: Date.now() - started,
      };
    } catch (cause) {
      this.options.logger.warn('loopback call failed', { tool: name, reason: String(cause) });
      throw new SourceUnavailableError('mcp', `could not call ${name}`, { cause });
    } finally {
      // Ends the session on the server too. Closing only the client left one
      // session per question open on the server for as long as it ran.
      await transport.terminateSession().catch(() => undefined);
      await client.close().catch(() => undefined);
    }
  }
}
