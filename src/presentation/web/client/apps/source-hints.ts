import type { LocationWire } from './app-types.js';

/**
 * What the add form can tell from a pasted source before asking the server:
 * which extra fields to show, and sensible names to start from.
 *
 * Pure functions with no DOM, so they are unit tested directly. The server still
 * decides what a source really is; these only shape the form while typing.
 */

const GITHUB_LINK = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+?(\.git)?(\/tree\/[^/?#]+)?\/?$/i;
const OWNER_REPO = /^[\w-]+\/[\w.-]+$/;
const DATA_FILE = /\.(json|csv|tsv|xml|rss|atom)$/i;

const FORMAT_NAMES: Readonly<Record<string, string>> = { rss: 'RSS feed', atom: 'Atom feed', json: 'JSON', csv: 'CSV' };

/** The same rules the server applies: a github.com link, or owner/name that is not a file. */
export function looksLikeRepo(text: string): boolean {
  const input = text.trim();
  return GITHUB_LINK.test(input) || (OWNER_REPO.test(input) && !DATA_FILE.test(input));
}

/** A web address that is not a GitHub repository, and so may need a key. */
export function looksLikeLink(text: string): boolean {
  const input = text.trim();
  return /^https?:\/\//i.test(input) && !looksLikeRepo(input);
}

/** A readable starting name: the repository, the host, or the file without its extension. */
export function nameFrom(text: string): string {
  const input = text.trim();
  if (looksLikeRepo(input)) {
    const parts = input.replace(/^https?:\/\/(www\.)?github\.com\//i, '').split('/');
    return words((parts[1] ?? parts[0] ?? input).replace(/\.git$/, ''));
  }
  if (looksLikeLink(input)) {
    try {
      return new URL(input).hostname.replace(/^www\./, '');
    } catch {
      return input;
    }
  }
  return words((input.split('/').pop() ?? input).replace(/\.[a-z0-9]+$/i, ''));
}

/** An app id the server accepts: lowercase, starting with a letter, 2 to 32 characters. */
export function toAppId(text: string): string {
  let id = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/^[a-z]/.test(id)) id = `app-${id}`;
  id = id.slice(0, 32).replace(/-+$/, '');
  return id.length >= 2 ? id : 'my-app';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A name to save a key under, from the host it is for: api.example.com becomes EXAMPLE_KEY. */
export function secretNameFor(text: string): string {
  let host = '';
  try {
    host = new URL(text.trim()).hostname;
  } catch {
    host = '';
  }
  const word = host.replace(/^(www|api)\./i, '').split('.')[0] || 'api';
  let name = word.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!/^[A-Z]/.test(name)) name = `KEY_${name}`;
  return `${name}_KEY`.slice(0, 64);
}

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/** The header value saved with the app: a reference to the key, never the key. */
export function keyHeaderValue(prefix: string, secretName: string): string {
  const scheme = prefix.trim();
  return `${scheme === '' ? '' : `${scheme} `}{{secret:${secretName.trim()}}}`;
}

/** A short name for the kind of source, for tags on cards and in forms. */
export function kindOf(location: Pick<LocationWire, 'type'> & { readonly format?: string }): string {
  if (location.type === 'github-repo') return 'GitHub';
  const format = location.format ?? '';
  const name = FORMAT_NAMES[format] ?? format.toUpperCase();
  return location.type === 'file' ? `File · ${name}` : name;
}

/** Where a location points, short enough for one line. */
export function describeLocation(location: LocationWire): string {
  switch (location.type) {
    case 'github-repo':
      return location.repo;
    case 'file':
      return location.path;
    case 'url':
      try {
        const url = new URL(location.url);
        return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
      } catch {
        return location.url;
      }
  }
}

/**
 * Adds a column to a field. An empty field takes the column as it is; a filled
 * one becomes a template, so picking Date then Price reads "{Date} {Price}".
 */
export function addColumn(current: string, column: string): string {
  const value = current.trim();
  if (value === '') return column;
  if (!value.includes('{')) return `{${value}} {${column}}`;
  return `${value} {${column}}`;
}

function words(text: string): string {
  return text.replace(/[-_.]+/g, ' ').trim();
}
