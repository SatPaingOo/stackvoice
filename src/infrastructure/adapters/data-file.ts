import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { ConfigError, SourceUnavailableError } from '../../domain/errors.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Reads a file source, refusing anything outside the data directory.
 *
 * The path was already checked for ".." when the source was built, but a
 * symbolic link inside the data directory can still point out of it. So the real
 * path is resolved and checked again before a single byte is read.
 */
export async function readDataFile(dataDir: string, path: string, sourceId: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(dataDir));
  } catch {
    throw new SourceUnavailableError(sourceId, `the data directory ${dataDir} does not exist yet`);
  }

  let actual: string;
  try {
    actual = await realpath(resolve(root, path));
  } catch {
    throw new SourceUnavailableError(sourceId, `there is no file at ${path} in the data directory`);
  }

  if (!isInside(root, actual)) {
    throw new SourceUnavailableError(sourceId, `${path} points outside the data directory`);
  }

  const info = await stat(actual);
  if (!info.isFile()) throw new SourceUnavailableError(sourceId, `${path} is not a file`);
  if (info.size > MAX_FILE_BYTES) throw new SourceUnavailableError(sourceId, `${path} is larger than 5 MB`);

  return readFile(actual, 'utf8');
}

/**
 * Refuses a data directory that overlaps the config directory either way round.
 * A file source can read anything inside the data directory, and config/ holds
 * secrets.yml and the owner token.
 *
 * @throws {ConfigError}
 */
export function assertDataDirIsolated(dataDir: string, configDir: string): void {
  const data = resolve(dataDir);
  const config = resolve(configDir);
  if (relative(data, config) === '' || isInside(data, config) || isInside(config, data)) {
    throw new ConfigError(
      'sources.data_dir overlaps the config directory, where keys are kept. Choose a folder of its own, such as "data".',
      data,
    );
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
