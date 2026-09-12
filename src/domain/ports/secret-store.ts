/**
 * Where API keys and other credentials live.
 *
 * Kept apart from app config on purpose. An app file says a header needs
 * `{{secret:NOTION_TOKEN}}`; only this store knows the value. App files can then
 * be shared, backed up, or committed without leaking anything, and a browser is
 * only ever told which secrets exist, never what they are.
 */
export interface SecretStore {
  /** The value, or null when no secret has that name. */
  get(name: string): Promise<string | null>;

  /** Names only. There is deliberately no way to list values. */
  names(): Promise<readonly string[]>;

  /** @throws {ValidationError} for a malformed name or an empty value. */
  set(name: string, value: string): Promise<void>;

  remove(name: string): Promise<void>;
}
