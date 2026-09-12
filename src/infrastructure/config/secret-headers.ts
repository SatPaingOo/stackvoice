import { SourceUnavailableError } from '../../domain/errors.js';
import type { SecretStore } from '../../domain/ports/secret-store.js';

const SECRET_REFERENCE = /\{\{secret:([^}]*)\}\}/g;

/**
 * Replaces `{{secret:NAME}}` in header values with the secret itself, at the last
 * possible moment: immediately before a request, in memory, never written back.
 *
 * @throws {SourceUnavailableError} naming the secret when one is missing, so the
 * console can say exactly what to add.
 */
export async function resolveHeaders(
  headers: Readonly<Record<string, string>>,
  secrets: SecretStore,
  sourceId: string,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    let result = value;
    for (const match of value.matchAll(SECRET_REFERENCE)) {
      const secretName = match[1] as string;
      const secret = await secrets.get(secretName);
      if (secret === null) {
        throw new SourceUnavailableError(
          sourceId,
          `needs the secret ${secretName}, which has not been added yet. ` +
            `Save it under Settings, Saved keys, or set STACKVOICE_SECRET_${secretName} before starting the server.`,
        );
      }
      result = result.split(match[0]).join(secret);
    }
    resolved[name] = result;
  }

  return resolved;
}
