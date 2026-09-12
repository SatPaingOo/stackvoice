/**
 * A neutral description of a tool to expose. The catalog produces these from
 * config; the MCP layer maps them onto SDK registrations. Nothing here knows
 * about the MCP SDK or JSON Schema.
 */
export type ToolVerb = 'search' | 'read' | 'status' | 'stack_status' | 'shortcut';

export interface ToolSpec {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly verb: ToolVerb;
  /** Empty for the global tool and for shortcuts. */
  readonly appId: string | null;
  /** The shortcut this tool runs, when `verb` is `shortcut`. */
  readonly shortcutName: string | null;
  /** Inputs the person fills by speaking, such as `topic`. Empty for every generated tool. */
  readonly slots: readonly string[];
  /** The phrases a shortcut listens for. Empty for every generated tool. */
  readonly phrases: readonly string[];
}
