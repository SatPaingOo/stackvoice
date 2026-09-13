/**
 * The apps API as the browser sees it. These mirror what the console routes send
 * and accept; header values never appear here, because the server never sends them.
 */

export type DataFormat = 'json' | 'rss' | 'atom' | 'csv';

export const FIELD_NAMES = ['title', 'summary', 'date', 'key', 'topic', 'region', 'url'] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export type FieldMapWire = Readonly<Record<FieldName, string | null>>;

export interface StatusFieldsWire {
  readonly lastDataDate: string | null;
  readonly itemCount: string | null;
}

export interface Primitives {
  readonly search: boolean;
  readonly read: boolean;
  readonly status: boolean;
}

/** A saved header, described by its scheme and the key it references. `secret` is null for one set by hand. */
export interface HeaderWire {
  readonly name: string;
  readonly prefix: string | null;
  readonly secret: string | null;
}

export interface GithubLocationWire {
  readonly type: 'github-repo';
  readonly repo: string;
  readonly branch: string;
  readonly viewsDir: string;
  readonly indexFile: string;
  readonly statsFile: string;
}

export interface UrlLocationWire {
  readonly type: 'url';
  readonly url: string;
  readonly format: DataFormat;
  readonly headers: readonly HeaderWire[];
}

export interface FileLocationWire {
  readonly type: 'file';
  readonly path: string;
  readonly format: DataFormat;
}

export type LocationWire = GithubLocationWire | UrlLocationWire | FileLocationWire;
export type SourceType = LocationWire['type'];

/**
 * A location on its way back. A url source either sends headers, which hold only
 * secret references, or leaves them out to keep the ones already saved.
 */
export type LocationInput =
  | {
      readonly type: 'github-repo';
      readonly repo: string;
      readonly branch: string;
      readonly indexFile: string;
      readonly statsFile: string;
    }
  | {
      readonly type: 'url';
      readonly url: string;
      readonly format: DataFormat;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | { readonly type: 'file'; readonly path: string; readonly format: DataFormat };

export interface SourceHealthWire {
  readonly itemCount: number | null;
  readonly lastDataDate: string | null;
  readonly lastError: string | null;
}

export interface AppWire {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly primitives: Primitives;
  readonly tools: readonly string[];
  readonly from: string;
  readonly location: LocationWire;
  readonly secretNames: readonly string[];
  readonly missingSecrets: readonly string[];
  readonly itemsPath: string | null;
  readonly fields: FieldMapWire;
  readonly statusFields: StatusFieldsWire;
  readonly health: { readonly ok: boolean; readonly sources: readonly SourceHealthWire[] } | null;
}

export interface EvidenceWire {
  readonly field: string;
  readonly path: string | null;
  readonly sample: string | null;
}

export interface ProposalWire {
  readonly location: LocationWire;
  readonly suggestedLabel: string | null;
  readonly itemsPath: string | null;
  readonly itemCount: number;
  readonly fields: FieldMapWire;
  readonly statusFields: StatusFieldsWire;
  readonly suggestedPrimitives: Primitives;
  readonly evidence: readonly EvidenceWire[];
  readonly availableKeys: readonly string[];
}

export interface AppInput {
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly primitives: Primitives;
  readonly location: LocationInput;
  readonly itemsPath: string | null;
  readonly fields: FieldMapWire;
  readonly statusFields: StatusFieldsWire;
}
