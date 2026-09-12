/**
 * Reads `a.b.c` out of a parsed JSON document. Config uses dot paths so an app
 * whose data is nested (`stats.events`) needs no code change.
 */
export function readPath(document: unknown, path: string): unknown {
  let current = document;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Reads a path and coerces to a trimmed string, or null when absent or empty. */
export function readString(document: unknown, path: string | null): string | null {
  if (path === null) return null;
  const value = readPath(document, path);
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Reads a path and coerces to a finite number, or null. */
export function readNumber(document: unknown, path: string): number | null {
  const value = readPath(document, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}
