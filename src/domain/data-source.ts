import { ValidationError } from './errors.js';

export type SourceType = 'github-repo';

/**
 * Which payload field feeds each field of the normalized `Item`. This is what
 * makes a new app with unfamiliar field names a config change rather than a
 * code change: `library` stores its summary in `tldr`, `markets` stores it in
 * `summary`, and the adapter never learns either name.
 */
export interface FieldMap {
  readonly key: string;
  readonly title: string;
  readonly summary: string | null;
  readonly date: string | null;
  readonly topic: string | null;
  readonly region: string | null;
  readonly url: string | null;
}

/**
 * Where the status verb finds freshness and volume inside the stats document.
 * Same idea as `FieldMap`: `library` publishes `last_date` and `total_items`,
 * `markets` publishes `updated_at` and `stats.events`. Dot paths are allowed.
 */
export interface StatusFieldMap {
  readonly lastDataDate: string;
  readonly itemCount: string;
}

export const DEFAULT_STATUS_FIELD_MAP: StatusFieldMap = {
  lastDataDate: 'last_date',
  itemCount: 'total_items',
};

export const DEFAULT_FIELD_MAP: FieldMap = {
  key: 'key',
  title: 'title',
  summary: 'summary',
  date: 'date',
  topic: 'topic',
  region: 'region',
  url: 'url',
};

export interface DataSourceProps {
  readonly id: string;
  readonly type: SourceType;
  readonly label: string;
  readonly repo: string;
  readonly viewsDir: string;
  readonly statsFile: string;
  readonly indexFile: string;
  /** Dot path to the array inside the index document; null when the document is itself an array. */
  readonly itemsPath: string | null;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
}

/** One data source inside an app. Validates its own shape at construction. */
export class DataSource {
  readonly id: string;
  readonly type: SourceType;
  readonly label: string;
  readonly repo: string;
  readonly viewsDir: string;
  readonly statsFile: string;
  readonly indexFile: string;
  readonly itemsPath: string | null;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;

  constructor(props: DataSourceProps) {
    if (!/^[\w-]+\/[\w.-]+$/.test(props.repo)) {
      throw new ValidationError(`"${props.repo}" is not an owner/name repository`, `sources.${props.id}.repo`);
    }
    this.id = props.id;
    this.type = props.type;
    this.label = props.label;
    this.repo = props.repo;
    this.viewsDir = props.viewsDir;
    this.statsFile = props.statsFile;
    this.indexFile = props.indexFile;
    this.itemsPath = props.itemsPath;
    this.fields = props.fields;
    this.statusFields = props.statusFields;
  }
}
