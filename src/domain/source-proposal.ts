import type { Primitives } from './app-definition.js';
import type { FieldMap, StatusFieldMap } from './data-source.js';

/**
 * What an inspector worked out about a data source it had never seen.
 *
 * The field map is the one genuinely hard part of adding an app: nobody wants
 * to open their own JSON and work out which key holds the title. A proposal is
 * a guess with its evidence attached, so the user can correct it rather than
 * author it.
 */
export interface FieldEvidence {
  /** The normalized field being filled, e.g. `summary`. */
  readonly field: string;
  /** The payload path chosen, or null when nothing looked right. */
  readonly path: string | null;
  /** A trimmed value from the data, so the user can see the guess was sane. */
  readonly sample: string | null;
}

export interface SourceProposal {
  readonly repo: string;
  readonly viewsDir: string;
  readonly indexFile: string;
  readonly statsFile: string | null;
  readonly itemsPath: string | null;
  readonly itemCount: number;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
  /**
   * The verbs this data can actually support. A source with no identifier
   * cannot be read back entry by entry, so proposing a `read` tool for it would
   * ship a tool that always fails.
   */
  readonly suggestedPrimitives: Primitives;
  readonly evidence: readonly FieldEvidence[];
  /** Every key seen on the first item, so the user can pick a different one. */
  readonly availableKeys: readonly string[];
  /** Paths that were tried and did not exist, worth showing when a guess is poor. */
  readonly triedPaths: readonly string[];
}
