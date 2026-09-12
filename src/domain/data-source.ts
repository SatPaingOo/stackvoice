import { ValidationError } from './errors.js';

/**
 * Where an app's records come from.
 *
 * - `github-repo`: JSON read models in a public repository, with the
 *   repository's Actions runs as the health signal.
 * - `url`: anything reachable over HTTP that serves JSON, RSS, Atom or CSV.
 *   An API, a news feed, a published spreadsheet, a static file on a website.
 * - `file`: a JSON, RSS, Atom or CSV file on this server, inside the data
 *   directory.
 */
export type SourceType = 'github-repo' | 'url' | 'file';

export type DataFormat = 'json' | 'rss' | 'atom' | 'csv';

export const DATA_FORMATS: readonly DataFormat[] = ['json', 'rss', 'atom', 'csv'];

/**
 * Which payload field feeds each field of the normalized `Item`.
 *
 * A value is either a dot path into the record (`tldr`, `author.name`) or a
 * template that combines several (`{Date}: {Price}`). Templates are what let a
 * record with no title of its own, such as a row of prices, still be read out.
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
 * Only GitHub sources publish a separate stats document; the other types count
 * their records and read the newest date directly.
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

export interface GithubLocation {
  readonly type: 'github-repo';
  readonly repo: string;
  readonly branch: string;
  readonly viewsDir: string;
  readonly indexFile: string;
  readonly statsFile: string;
}

export interface UrlLocation {
  readonly type: 'url';
  readonly url: string;
  readonly format: DataFormat;
  /**
   * Request headers, typically an API key. A value may reference a secret as
   * `{{secret:NAME}}`. Secrets are resolved on the server at fetch time and are
   * never written to the app file or sent to a browser.
   */
  readonly headers: Readonly<Record<string, string>>;
}

export interface FileLocation {
  readonly type: 'file';
  /** Relative to the data directory. */
  readonly path: string;
  readonly format: DataFormat;
}

export type SourceLocation = GithubLocation | UrlLocation | FileLocation;

interface CommonProps {
  readonly id: string;
  readonly label: string;
  /** Dot path to the list inside the document; null when the document is itself the list. */
  readonly itemsPath: string | null;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
}

export type DataSourceProps = CommonProps &
  ((Omit<GithubLocation, 'branch'> & { readonly branch?: string }) | UrlLocation | FileLocation);

const SECRET_REFERENCE = /\{\{secret:([^}]*)\}\}/g;
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** Headers the HTTP client owns. A config that sets them is either confused or up to something. */
const RESERVED_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'cookie']);

/** One data source inside an app. Validates its own shape at construction. */
export class DataSource {
  readonly id: string;
  readonly label: string;
  readonly itemsPath: string | null;
  readonly fields: FieldMap;
  readonly statusFields: StatusFieldMap;
  readonly location: SourceLocation;

  constructor(props: DataSourceProps) {
    this.id = props.id;
    this.label = props.label;
    this.itemsPath = props.itemsPath;
    this.fields = props.fields;
    this.statusFields = props.statusFields;
    this.location = validateLocation(props);
  }

  get type(): SourceType {
    return this.location.type;
  }

  /** Where the data comes from, short enough for a list or a log line. */
  describe(): string {
    switch (this.location.type) {
      case 'github-repo':
        return this.location.repo;
      case 'url': {
        const url = new URL(this.location.url);
        return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
      }
      case 'file':
        return this.location.path;
    }
  }

  /** Secret names this source needs, so a missing one can be reported by name. */
  secretNames(): readonly string[] {
    if (this.location.type !== 'url') return [];
    const names = new Set<string>();
    for (const value of Object.values(this.location.headers)) {
      for (const match of value.matchAll(SECRET_REFERENCE)) names.add(match[1] as string);
    }
    return [...names];
  }
}

function validateLocation(props: DataSourceProps): SourceLocation {
  const field = (name: string): string => `sources.${props.id}.${name}`;

  switch (props.type) {
    case 'github-repo': {
      if (!/^[\w-]+\/[\w.-]+$/.test(props.repo)) {
        throw new ValidationError(`"${props.repo}" is not an owner/name repository`, field('repo'));
      }
      const branch = (props.branch ?? 'main').trim();
      if (branch === '' || /\s/.test(branch)) {
        throw new ValidationError(`"${branch}" is not a branch name`, field('branch'));
      }
      return {
        type: 'github-repo',
        repo: props.repo,
        branch,
        viewsDir: props.viewsDir,
        indexFile: props.indexFile,
        statsFile: props.statsFile,
      };
    }

    case 'url': {
      let parsed: URL;
      try {
        parsed = new URL(props.url);
      } catch {
        throw new ValidationError(`"${props.url}" is not a web address`, field('url'));
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ValidationError('only http and https addresses can be read', field('url'));
      }
      if (parsed.username !== '' || parsed.password !== '') {
        throw new ValidationError(
          'put credentials in a header, not in the address, so they are never written into the app file',
          field('url'),
        );
      }
      assertFormat(props.format, field('format'));

      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(props.headers)) {
        if (!HEADER_NAME_PATTERN.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) {
          throw new ValidationError(`"${name}" is not a header a source can set`, field('headers'));
        }
        for (const match of value.matchAll(SECRET_REFERENCE)) {
          if (!SECRET_NAME_PATTERN.test(match[1] as string)) {
            throw new ValidationError(
              `"${match[1] as string}" is not a secret name; use capital letters, digits and underscores`,
              field('headers'),
            );
          }
        }
        headers[name] = value;
      }
      return { type: 'url', url: parsed.toString(), format: props.format, headers };
    }

    case 'file': {
      const path = props.path.trim().replace(/\\/g, '/');
      // A file source is read from inside the data directory and nowhere else. A
      // path that climbs out of it could read config/secrets.yml.
      if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) {
        throw new ValidationError(
          'a file source must be a path inside the data directory, with no "..", drive letter or leading slash',
          field('path'),
        );
      }
      assertFormat(props.format, field('format'));
      return { type: 'file', path, format: props.format };
    }
  }
}

function assertFormat(format: string, field: string): void {
  if (!(DATA_FORMATS as readonly string[]).includes(format)) {
    throw new ValidationError(`"${format}" is not a format StackVoice reads; use json, rss, atom or csv`, field);
  }
}
