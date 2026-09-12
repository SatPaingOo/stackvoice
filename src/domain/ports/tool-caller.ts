/**
 * Calling a tool on this server, from the outside.
 *
 * The simulator sits on this port so the conversation logic never learns
 * whether the call travelled over HTTP, a socket, or nothing at all.
 */
export interface ToolCallOutcome {
  /** What the assistant would say out loud. */
  readonly spoken: string;
  /** The machine-readable half, used to carry a key into the next turn. */
  readonly structured: Record<string, unknown> | null;
  readonly isError: boolean;
  readonly latencyMs: number;
}

export interface ToolCaller {
  /** @throws {SourceUnavailableError} when the call could not be made at all. */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome>;
}
