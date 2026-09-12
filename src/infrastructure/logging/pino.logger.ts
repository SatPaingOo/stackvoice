import pino from 'pino';

import type { LogFields, Logger } from '../../domain/ports/logger.js';
import type { LogLevel } from '../../domain/settings.js';

/** Structured JSON logging. Never logs tokens, secrets, or tool argument values. */
export class PinoLogger implements Logger {
  private constructor(private readonly inner: pino.Logger) {}

  static create(level: LogLevel): PinoLogger {
    return new PinoLogger(pino({ level, base: { service: 'stackvoice' } }));
  }

  info(message: string, fields?: LogFields): void {
    this.inner.info(fields ?? {}, message);
  }

  warn(message: string, fields?: LogFields): void {
    this.inner.warn(fields ?? {}, message);
  }

  error(message: string, fields?: LogFields): void {
    this.inner.error(fields ?? {}, message);
  }

  debug(message: string, fields?: LogFields): void {
    this.inner.debug(fields ?? {}, message);
  }

  child(fields: LogFields): Logger {
    return new PinoLogger(this.inner.child(fields));
  }
}
