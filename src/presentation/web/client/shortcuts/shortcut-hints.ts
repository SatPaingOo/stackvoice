/**
 * Small rules the shortcut form applies while typing. Pure, so they are unit
 * tested without a browser. The server applies the same rules again on save.
 */

/** The tool a shortcut becomes: "Morning brief" is `morning_brief`. Same rule as the domain's. */
export function toolNameFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type ParsedArgs =
  | { readonly ok: true; readonly args: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly problem: string };

/** A step's arguments, typed as JSON. Empty means none. */
export function parseArgs(text: string): ParsedArgs {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, args: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, problem: 'is not valid JSON' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, problem: 'must be an object, such as {"limit": 2}' };
  }
  return { ok: true, args: parsed as Record<string, unknown> };
}
