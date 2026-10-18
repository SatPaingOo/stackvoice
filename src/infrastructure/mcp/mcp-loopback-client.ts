import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { SourceUnavailableError } from '../../domain/errors.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ToolCallOutcome, ToolCaller, ToolView } from '../../domain/ports/tool-caller.js';

const VIEW_MIME = 'text/html;profile=mcp-app';

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
    // Says it can show MCP Apps views, as a host with a screen would.
    const client = new Client(
      { name: 'stackvoice-simulator', version: '1.0.0' },
      { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [VIEW_MIME] } } } },
    );
    const transport = new StreamableHTTPClientTransport(new URL(this.options.endpoint), {
      requestInit:
        this.options.bearerToken === null ? {} : { headers: { authorization: `Bearer ${this.options.bearerToken}` } },
    });

    try {
      await client.connect(transport);
      const viewUri = await this.viewFor(client, name);
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
        view:
          viewUri === null || result.isError === true
            ? null
            : await this.readView(client, viewUri, {
                content,
                structuredContent: (result.structuredContent as Record<string, unknown> | undefined) ?? null,
              }),
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

  /** The `ui://` resource a tool links its results to, if any (`_meta.ui.resourceUri`). */
  private async viewFor(client: Client, name: string): Promise<string | null> {
    const { tools } = await client.listTools();
    const meta = tools.find((tool) => tool.name === name)?._meta as { ui?: { resourceUri?: unknown } } | undefined;
    const uri = meta?.ui?.resourceUri;
    return typeof uri === 'string' && uri.startsWith('ui://') ? uri : null;
  }

  /** Fetches the view itself. A view that cannot be read only costs the screen, never the answer. */
  private async readView(client: Client, uri: string, result: ToolView['result']): Promise<ToolView | null> {
    try {
      const { contents } = await client.readResource({ uri });
      const part = contents.find((candidate) => candidate.mimeType === VIEW_MIME);
      // The spec allows the document as text or as base64.
      const html =
        part === undefined ? undefined : 'text' in part ? part.text : Buffer.from(part.blob, 'base64').toString('utf8');
      return typeof html === 'string' ? { resourceUri: uri, html, result } : null;
    } catch (cause) {
      this.options.logger.warn('view could not be read', { uri, reason: String(cause) });
      return null;
    }
  }
}
