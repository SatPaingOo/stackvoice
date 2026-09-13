/**
 * The shortcuts API as the browser sees it. Blocks mirror the domain's shape,
 * which is what the console routes send and accept.
 */

export type ArgValue = string | number | boolean;

export type FlowFunction =
  | 'count'
  | 'first'
  | 'last'
  | 'item'
  | 'titles'
  | 'title'
  | 'summary'
  | 'date'
  | 'when'
  | 'link'
  | 'topic'
  | 'region'
  | 'key';

export type CountOperator = 'is' | 'more_than' | 'less_than';
export type TextOperator = 'contains' | 'is' | 'is_empty' | 'is_not_empty';

export type ConditionWire =
  | { readonly kind: 'count'; readonly variable: string; readonly op: CountOperator; readonly value: number }
  | { readonly kind: 'text'; readonly template: string; readonly op: TextOperator; readonly value: string }
  | { readonly kind: 'failed'; readonly variable: string };

export type BlockWire =
  | {
      readonly kind: 'ask';
      readonly tool: string;
      readonly args: Readonly<Record<string, ArgValue>>;
      readonly as: string;
    }
  | {
      readonly kind: 'if';
      readonly condition: ConditionWire;
      readonly then: readonly BlockWire[];
      readonly otherwise: readonly BlockWire[];
    }
  | { readonly kind: 'say'; readonly text: string }
  | {
      readonly kind: 'get';
      readonly fn: FlowFunction;
      readonly from: string;
      readonly index: number | null;
      readonly as: string;
    }
  | { readonly kind: 'set'; readonly name: string; readonly to: string }
  | { readonly kind: 'stop' };

export type BlockKind = BlockWire['kind'];

export interface ShortcutWire {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly toolName: string;
  readonly triggers: readonly string[];
  readonly slots: readonly string[];
  readonly blocks: readonly BlockWire[];
  /** The tools its Ask blocks call, each once. */
  readonly tools: readonly string[];
}

export interface ShortcutInput {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly triggers: readonly string[];
  readonly blocks: readonly BlockWire[];
}

/** A tool an Ask block can call. */
export interface ToolWire {
  readonly name: string;
  readonly title: string;
  readonly verb: string;
  readonly takesQuery: boolean;
  readonly needsKey: boolean;
}

export interface TraceEntryWire {
  readonly at: string;
  readonly kind: BlockKind;
  readonly summary: string;
  readonly ok: boolean;
  readonly ms: number;
}

export interface TryResult {
  readonly spoken: string;
  readonly trace: readonly TraceEntryWire[];
}

/** The server's limits, read from the page so the builder and the server agree. */
export interface FlowLimits {
  readonly maxTriggers: number;
  readonly maxBlocks: number;
  readonly maxAsks: number;
  readonly maxDepth: number;
}
