/** The shortcuts API as the browser sees it, mirroring what the console routes send and accept. */

export interface ShortcutStepWire {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface ShortcutWire {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly reply: string;
  readonly toolName: string;
  readonly steps: readonly ShortcutStepWire[];
}

export interface ShortcutInput {
  readonly name: string;
  readonly description: string;
  readonly reply: string;
  readonly enabled: boolean;
  readonly steps: readonly ShortcutStepWire[];
}

/** A tool a step can run. */
export interface ToolWire {
  readonly name: string;
  readonly title: string;
  readonly takesQuery: boolean;
  readonly needsKey: boolean;
}
