import { ValidationError } from '../domain/errors.js';
import type { SourceTarget } from '../domain/ports/source-inspector.js';

const DATA_FILE = /\.(json|csv|tsv|xml|rss|atom)$/i;

/**
 * Works out what someone pasted: a link, a GitHub repository, or a file path.
 *
 * One box for everything is the point. A person should not have to know whether
 * their data is "a url source" or "a github-repo source" before they can add it.
 *
 * - `https://github.com/owner/repo`, optionally `/tree/branch`, is a repository.
 * - Any other http or https address is a url source.
 * - `owner/name` with no file extension is a repository.
 * - Anything else is a file inside the data directory.
 */
export function parseSourceInput(raw: string, headers: Readonly<Record<string, string>> = {}): SourceTarget {
  const input = raw.trim();
  if (input === '') {
    throw new ValidationError('paste a link, a GitHub repository or a file path', 'input');
  }

  if (/^https?:\/\//i.test(input)) {
    const github = /^https?:\/\/(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?\/?$/i.exec(input);
    if (github !== null) {
      return { type: 'github-repo', repo: `${github[1] as string}/${github[2] as string}`, branch: github[3] };
    }
    return { type: 'url', url: input, headers };
  }

  if (/^[\w-]+\/[\w.-]+$/.test(input) && !DATA_FILE.test(input)) {
    return { type: 'github-repo', repo: input };
  }

  return { type: 'file', path: input };
}
