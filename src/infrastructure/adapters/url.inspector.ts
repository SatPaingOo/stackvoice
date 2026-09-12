import { extname } from 'node:path';

import {
  DEFAULT_STATUS_FIELD_MAP,
  type DataFormat,
  type FieldMap,
  type SourceLocation,
} from '../../domain/data-source.js';
import { SourceUnavailableError, ValidationError } from '../../domain/errors.js';
import type { SecretStore } from '../../domain/ports/secret-store.js';
import type { SourceInspector, SourceTarget } from '../../domain/ports/source-inspector.js';
import type { SourceProposal } from '../../domain/source-proposal.js';
import { resolveHeaders } from '../config/secret-headers.js';
import { detectFormat } from '../formats/detect.js';
import { ParseError, parseBody } from '../formats/parse.js';
import type { TextFetcher } from '../http/http-client.js';
import { readDataFile } from './data-file.js';
import { buildEvidence, fallbackTitle, inferFields, isPlainObject, locateItems } from './records.js';

export interface UrlSourceInspectorOptions {
  readonly http: TextFetcher;
  readonly secrets: SecretStore;
  readonly dataDir: string;
}

/** A file's extension, for when its contents alone cannot decide. */
const EXTENSION_FORMATS: Readonly<Record<string, DataFormat>> = {
  '.json': 'json',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.rss': 'rss',
  '.atom': 'atom',
};

/**
 * Looks at a link or a file nobody has configured and proposes how to read it.
 *
 * The body decides the format, not the address or the server's content type,
 * which are wrong often enough to be useless. Then the same record guessing every
 * source type shares.
 */
export class UrlSourceInspector implements SourceInspector {
  constructor(private readonly options: UrlSourceInspectorOptions) {}

  async inspect(target: SourceTarget): Promise<SourceProposal> {
    if (target.type === 'github-repo') {
      throw new ValidationError('a GitHub repository is inspected by the GitHub inspector', 'type');
    }

    const name = target.type === 'url' ? target.url : target.path;
    const { body, contentType } = await this.load(target);

    const extensionFormat = target.type === 'file' ? (EXTENSION_FORMATS[extname(target.path).toLowerCase()] ?? null) : null;
    const format = detectFormat(body, contentType) ?? extensionFormat;
    if (format === null) {
      throw new SourceUnavailableError(
        name,
        looksLikeWebPage(body)
          ? 'this is a web page, not data. Look on the page for an RSS feed, a JSON API or a CSV download, and paste that link instead.'
          : 'could not tell what this is. StackVoice reads JSON, RSS, Atom and CSV.',
      );
    }

    let document: unknown;
    try {
      document = parseBody(body, format);
    } catch (error) {
      if (error instanceof ParseError) throw new SourceUnavailableError(name, error.message, { cause: error });
      throw error;
    }

    const located = locateItems(document);
    if (located === null) {
      throw new SourceUnavailableError(name, `this ${format.toUpperCase()} has no list of records in it`);
    }

    const first = located.items[0] as Record<string, unknown>;
    const inferred = inferFields(located.items);

    // Something to say, in order of preference: a title, a summary, whatever columns hold text.
    const title = inferred.title ?? inferred.summary ?? fallbackTitle(located.items);
    if (title === null) {
      throw new SourceUnavailableError(
        name,
        `the records have nothing that can be read out. Keys seen: ${Object.keys(first).sort().join(', ')}.`,
      );
    }

    // A real identifier makes an entry readable on its own later. Without one, a
    // link or a date still keys the records, but reading one back is not offered.
    const identity = inferred.key ?? inferred.url;
    const fields: FieldMap = {
      key: identity ?? inferred.date ?? title,
      title,
      summary: inferred.summary,
      date: inferred.date,
      topic: inferred.topic,
      region: inferred.region,
      url: inferred.url,
    };

    const location: SourceLocation =
      target.type === 'url'
        ? { type: 'url', url: target.url, format, headers: { ...(target.headers ?? {}) } }
        : { type: 'file', path: target.path, format };

    return {
      location,
      suggestedLabel: channelTitle(document),
      itemsPath: located.path,
      itemCount: located.items.length,
      fields,
      statusFields: DEFAULT_STATUS_FIELD_MAP,
      suggestedPrimitives: { search: true, read: identity !== null, status: true },
      evidence: buildEvidence(fields, first),
      availableKeys: Object.keys(first).sort(),
      triedPaths: [],
    };
  }

  private async load(
    target: Extract<SourceTarget, { type: 'url' | 'file' }>,
  ): Promise<{ body: string; contentType: string | null }> {
    if (target.type === 'url') {
      // Secrets are filled in for this request only. The proposal keeps the reference.
      const headers = await resolveHeaders(target.headers ?? {}, this.options.secrets, target.url);
      const response = await this.options.http.getText(target.url, target.url, { headers });
      return { body: response.body, contentType: response.contentType };
    }
    return { body: await readDataFile(this.options.dataDir, target.path, target.path), contentType: null };
  }
}

/** A feed names itself; that name makes a better app label than a hostname. */
function channelTitle(document: unknown): string | null {
  if (!isPlainObject(document)) return null;
  const channel = document['channel'];
  return isPlainObject(channel) && typeof channel['title'] === 'string' && channel['title'] !== '' ? channel['title'] : null;
}

function looksLikeWebPage(body: string): boolean {
  return /^\s*<(!doctype html|html)/i.test(body.slice(0, 500));
}
