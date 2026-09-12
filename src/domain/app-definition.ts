import type { DataSource } from './data-source.js';
import { ValidationError } from './errors.js';

export const APP_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

/** Which verbs this app turns into tools. */
export interface Primitives {
  readonly search: boolean;
  readonly read: boolean;
  readonly status: boolean;
}

export interface AppDefinitionProps {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly primitives: Primitives;
  readonly sources: readonly DataSource[];
}

/**
 * Aggregate for one configured app. It owns its invariants — an invalid
 * `AppDefinition` cannot exist, which is why this is a class and not a bag of
 * fields.
 */
export class AppDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly primitives: Primitives;
  readonly sources: readonly DataSource[];

  constructor(props: AppDefinitionProps) {
    if (!APP_ID_PATTERN.test(props.id)) {
      throw new ValidationError(
        `"${props.id}" must be lowercase, start with a letter, and be 2-32 characters of a-z, 0-9 or "-"`,
        'id',
      );
    }
    if (props.sources.length === 0) {
      throw new ValidationError('an app needs at least one source', `${props.id}.sources`);
    }
    const ids = new Set<string>();
    for (const source of props.sources) {
      if (ids.has(source.id)) {
        throw new ValidationError(`duplicate source id "${source.id}"`, `${props.id}.sources`);
      }
      ids.add(source.id);
    }

    this.id = props.id;
    this.label = props.label;
    this.description = props.description;
    this.enabled = props.enabled;
    this.primitives = props.primitives;
    this.sources = props.sources;
  }

  /** The verbs that should become tools, in a stable order. */
  enabledVerbs(): readonly ('search' | 'read' | 'status')[] {
    const verbs: ('search' | 'read' | 'status')[] = [];
    if (this.primitives.search) verbs.push('search');
    if (this.primitives.read) verbs.push('read');
    if (this.primitives.status) verbs.push('status');
    return verbs;
  }

  /** The source a verb runs against. Multi-source fan-out lands with the second source type. */
  primarySource(): DataSource {
    return this.sources[0] as DataSource;
  }
}
