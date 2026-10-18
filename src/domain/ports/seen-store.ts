/**
 * What the owner has already been told about one app.
 *
 * This is the one thing StackVoice remembers between conversations, so "what's
 * new?" can mean "since I last asked" rather than "the newest few".
 */
export interface SeenMark {
  /** The date of the newest entry already reported, exactly as the source gives it. */
  readonly seenUntil: string;
  /** When the owner last asked, as an ISO timestamp. */
  readonly askedAt: string;
}

/** Per app id. Losing it is harmless: the next answer starts tracking again. */
export interface SeenStore {
  load(): Promise<Readonly<Record<string, SeenMark>>>;
  save(marks: Readonly<Record<string, SeenMark>>): Promise<void>;
}
