/**
 * A neutral description of a tool to expose. The catalog produces these from
 * config; the MCP layer maps them onto SDK registrations. Nothing here knows
 * about the MCP SDK or JSON Schema.
 */
export type ToolVerb = 'search' | 'read' | 'status' | 'stack_status';

export interface ToolSpec {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly verb: ToolVerb;
  /** Empty for the global tool. */
  readonly appId: string | null;
}
