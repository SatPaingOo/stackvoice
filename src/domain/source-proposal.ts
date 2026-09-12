import type { Primitives } from './app-definition.js';
import type { FieldMap, SourceLocation, StatusFieldMap } from './data-source.js';

/**
 * What an inspector worked out about a data source it had never seen.
 *
 * The field map is the genuinely hard part of adding an app: nobody wants to
 * open their own data and work out which key holds the title. A proposal is a
 * guess with its evidence attached, so the person corrects it rather than
 * authors it.
 */
export interface FieldEvidence {
  /** The normalized field being filled, such as `summary`. */
  readonly field: string;
  /** The payload path or template chosen, or null when nothing looked right. */
  readonly path: string | null;
  /** A trimmed value from the data, so a person can see the guess was sane. */
  readonly sample: string | null;
}

export interface SourceProposal {
  /** Where the records were found, ready to become a source. */
  readonly location: SourceLocation;
  /** A name the data gives itself, such as a feed's title, to offer as the app label. */
  readonly suggestedLabel: string | null;
  readonly itemsPath: string | null;
  readonly itemCount: number;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
  /**
   * The verbs this data can actually support. A source with no identifier cannot
   * be read back entry by entry, so offering a `read` tool for it would ship a
   * tool that always fails.
   */
  readonly suggestedPrimitives: Primitives;
  readonly evidence: readonly FieldEvidence[];
  /** Every key on the first record, so a person can pick a different one. */
  readonly availableKeys: readonly string[];
  /** Paths tried and not found, worth showing when a guess is poor. */
  readonly triedPaths: readonly string[];
}
