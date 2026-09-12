/**
 * Typed domain errors. Nothing outside this file throws a bare `Error`, so the
 * presentation layer can map failures once (MCP result text, CLI exit code,
 * HTTP status) without string-matching messages.
 */

/** Base class so presentation can narrow with a single `instanceof`. */
export abstract class StackVoiceError extends Error {
  abstract readonly code: string;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Configuration on disk is missing, unreadable, or structurally invalid. */
export class ConfigError extends StackVoiceError {
  readonly code = 'CONFIG_ERROR';

  constructor(
    message: string,
    readonly file: string,
    options?: { cause?: unknown },
  ) {
    super(`${message} (${file})`, options);
  }
}

/** A value failed validation. `field` names the offending path, e.g. `server.port`. */
export class ValidationError extends StackVoiceError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    readonly field: string,
  ) {
    super(`${field}: ${message}`);
  }
}

/** An app id was referenced that the registry does not know. */
export class AppNotFoundError extends StackVoiceError {
  readonly code = 'APP_NOT_FOUND';

  constructor(readonly appId: string) {
    super(`No app is configured with id "${appId}".`);
  }
}

/** A data source could not be read (network, missing file, malformed payload). */
export class SourceUnavailableError extends StackVoiceError {
  readonly code = 'SOURCE_UNAVAILABLE';

  constructor(
    readonly sourceId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`Source "${sourceId}" is unavailable: ${message}`, options);
  }
}
