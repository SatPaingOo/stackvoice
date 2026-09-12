import { parse as parseCsv } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';

import type { DataFormat } from '../../domain/data-source.js';
import { detectDelimiter } from './detect.js';

/**
 * A body could not be read as the format it was said to be.
 *
 * Internal to infrastructure: adapters wrap it in a typed domain error, so it
 * never reaches a caller as a bare `Error`.
 */
export class ParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ParseError';
  }
}

/** What a feed item or entry becomes: the same shape whatever the feed format. */
export interface FeedRecord {
  readonly id: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly date: string | null;
  readonly link: string | null;
  readonly category: string | null;
  readonly author: string | null;
}

export interface FeedDocument {
  readonly channel: { readonly title: string | null; readonly link: string | null; readonly updated: string | null };
  readonly items: readonly FeedRecord[];
}

/**
 * Parses a body into plain data that the rest of the pipeline walks with dot
 * paths.
 *
 * Feeds are flattened on the way in. An RSS `<item>` and an Atom `<entry>` both
 * become a `FeedRecord`, with HTML stripped from the summary and the date
 * normalized to ISO, so feeds sort correctly and the inspector can treat a feed
 * exactly like a JSON list.
 */
export function parseBody(body: string, format: DataFormat): unknown {
  switch (format) {
    case 'json':
      return parseJson(body);
    case 'csv':
      return parseCsvBody(body);
    case 'rss':
      return parseRss(body);
    case 'atom':
      return parseAtom(body);
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body.replace(/^﻿/, ''));
  } catch (cause) {
    throw new ParseError('the body is not valid JSON', { cause });
  }
}

function parseCsvBody(body: string): Record<string, string>[] {
  const text = body.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '') ?? ',';
  try {
    return parseCsv(text, {
      columns: (header: string[]) => header.map((name, index) => name.trim() || `column${index + 1}`),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      delimiter,
    }) as Record<string, string>[];
  } catch (cause) {
    throw new ParseError('the body is not valid CSV', { cause });
  }
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name: string) => name === 'item' || name === 'entry' || name === 'link' || name === 'category',
});

function readXml(body: string): Record<string, unknown> {
  // A document that declares its own entities can expand to many times its size
  // while it is parsed. No real feed needs one, so refuse rather than risk it.
  if (/<!ENTITY/i.test(body)) {
    throw new ParseError('the feed declares its own XML entities, which StackVoice does not read');
  }
  try {
    return xml.parse(body, true) as Record<string, unknown>;
  } catch (cause) {
    throw new ParseError('the body is not valid XML', { cause });
  }
}

function parseRss(body: string): FeedDocument {
  const doc = readXml(body);
  const rss = asRecord(doc['rss']);
  const rdf = asRecord(doc['rdf:RDF']);
  if (rss === null && rdf === null) throw new ParseError('the body is not an RSS feed');

  const channel = asRecord(rss?.['channel'] ?? rdf?.['channel']);
  // RSS 2.0 nests items in the channel; RSS 1.0 makes them siblings of it.
  const rawItems = rss !== null ? channel?.['item'] : rdf?.['item'];

  const items = toArray(rawItems).map((entry): FeedRecord => {
    const e = asRecord(entry) ?? {};
    const link = text(e['link']);
    return {
      id: text(e['guid']) ?? link ?? text(e['title']),
      title: stripHtml(text(e['title'])),
      summary: stripHtml(text(e['description']) ?? text(e['content:encoded'])),
      date: isoDate(text(e['pubDate']) ?? text(e['dc:date'])),
      link,
      category: text(e['category']),
      author: text(e['author']) ?? text(e['dc:creator']),
    };
  });

  return {
    channel: {
      title: stripHtml(text(channel?.['title'])),
      link: text(channel?.['link']),
      updated: isoDate(text(channel?.['lastBuildDate']) ?? text(channel?.['pubDate'])),
    },
    items,
  };
}

function parseAtom(body: string): FeedDocument {
  const feed = asRecord(readXml(body)['feed']);
  if (feed === null) throw new ParseError('the body is not an Atom feed');

  const items = toArray(feed['entry']).map((entry): FeedRecord => {
    const e = asRecord(entry) ?? {};
    const link = atomLink(e['link']);
    return {
      id: text(e['id']) ?? link,
      title: stripHtml(text(e['title'])),
      summary: stripHtml(text(e['summary']) ?? text(e['content'])),
      // A story's date is when it was published; updated is the fallback.
      date: isoDate(text(e['published']) ?? text(e['updated'])),
      link,
      category: text(e['category']),
      author: text(asRecord(e['author'])?.['name']),
    };
  });

  return {
    channel: {
      title: stripHtml(text(feed['title'])),
      link: atomLink(feed['link']),
      updated: isoDate(text(feed['updated'])),
    },
    items,
  };
}

/** The page an Atom entry points at: the alternate link, or the first there is. */
function atomLink(value: unknown): string | null {
  const links = toArray(value)
    .map(asRecord)
    .filter((link): link is Record<string, unknown> => link !== null);
  const chosen = links.find((link) => link['@_rel'] === undefined || link['@_rel'] === 'alternate') ?? links[0];
  const href = chosen?.['@_href'];
  return typeof href === 'string' && href !== '' ? href : null;
}

/** Text out of whatever shape the XML parser produced for an element. */
function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  }
  if (Array.isArray(value)) return text(value[0]);
  const record = asRecord(value);
  if (record === null) return null;
  return text(record['#text'] ?? record['@_term'] ?? record['name'] ?? null);
}

/** Plain text a person can listen to: no tags, no entities, no stray spacing. */
export function stripHtml(value: string | null): string | null {
  if (value === null) return null;
  const plain = value
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(#39|apos);/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return plain === '' ? null : plain;
}

/**
 * An ISO timestamp when the value is a date JavaScript can read, otherwise the
 * value unchanged. RSS dates look like "Sat, 13 Sep 2026 09:30:00 GMT", which
 * sort alphabetically by weekday; ISO sorts by time.
 */
export function isoDate(value: string | null): string | null {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
