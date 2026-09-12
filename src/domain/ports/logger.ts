/**
 * Logging port. The core never imports a logging library; the composition root
 * injects an implementation from `infrastructure/logging`.
 */
export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  /** Returns a logger that stamps `fields` onto every subsequent entry. */
  child(fields: LogFields): Logger;
}
