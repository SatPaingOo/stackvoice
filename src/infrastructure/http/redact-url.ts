/**
 * An address as it may appear in a log line or an error message: the names in
 * its query string kept, their values hidden, and any fragment dropped.
 *
 * Some APIs take their key in the query string, as `?api_key=…`. An error
 * message does not stay in the log: it becomes a source's `lastError`, which the
 * assistant reads aloud and the console shows, so the value must never be in it.
 * Every value is hidden, not only the ones whose name looks like a key, because
 * a key can be called anything.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'an address that could not be read';
  }

  const names = [...parsed.searchParams.keys()];
  const query = names.length === 0 ? '' : `?${names.map((name) => `${encodeURIComponent(name)}=…`).join('&')}`;
  // `origin` leaves out any user and password, as the address check already requires.
  return `${parsed.origin}${parsed.pathname}${query}`;
}
