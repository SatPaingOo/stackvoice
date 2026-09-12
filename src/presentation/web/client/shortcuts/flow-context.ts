import type { BlockKind, BlockWire, FlowLimits, ToolWire } from './shortcut-types.js';

/** Edits one block. Every kind of block has one, and a list holds them without asking which kind. */
export interface BlockEditor {
  readonly kind: BlockKind;
  readonly element: HTMLElement;
  read(): BlockWire;
}

/** An ordered list of blocks: a whole flow, or one branch of an If. */
export interface BlockList {
  readonly element: HTMLElement;
  read(): BlockWire[];
}

/**
 * What a block editor may ask of the flow it sits in.
 *
 * Editors depend on this and never on the form or on each other. An If block
 * gets its branches from `createList` instead of importing the list that holds
 * it, and a Say block learns which names it can insert from `tokens`.
 */
export interface FlowContext {
  readonly limits: FlowLimits;
  tools(): readonly ToolWire[];
  /** Everything a template can use right now, in braces. */
  tokens(): readonly string[];
  /** Names an Ask block saved its answer under. */
  answers(): readonly string[];
  /** Slots and every saved name, for a Get block to read from. */
  values(): readonly string[];
  createList(depth: number, blocks: readonly BlockWire[]): BlockList;
  /** Starting values for a new block, from what the flow already has. */
  starter(kind: BlockKind): BlockWire;
  /** Something about the flow changed shape: a block, a name, or a phrase. */
  changed(): void;
}
