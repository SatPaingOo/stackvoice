/**
 * Calling a tool on this server, from the outside.
 *
 * The simulator sits on this port so the conversation logic never learns
 * whether the call travelled over HTTP, a socket, or nothing at all.
 */
/**
 * A view the tool offers for its result, already fetched, for a host with a
 * screen to show beside the spoken answer (MCP Apps).
 */
export interface ToolView {
  readonly resourceUri: string;
  /** The view's whole HTML document. */
  readonly html: string;
  /** The tool result as the view receives it: the text parts and the structured data. */
  readonly result: {
    readonly content: readonly unknown[];
    readonly structuredContent: Record<string, unknown> | null;
  };
}

export interface ToolCallOutcome {
  /** What the assistant would say out loud. */
  readonly spoken: string;
  /** The machine-readable half, used to carry a key into the next turn. */
  readonly structured: Record<string, unknown> | null;
  readonly isError: boolean;
  readonly latencyMs: number;
  /** Null when the tool offers no view, or it could not be fetched. */
  readonly view: ToolView | null;
}

export interface ToolCaller {
  /** @throws {SourceUnavailableError} when the call could not be made at all. */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome>;
}
