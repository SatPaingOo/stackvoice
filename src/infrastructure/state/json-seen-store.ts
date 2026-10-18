import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

import type { SeenMark, SeenStore } from '../../domain/ports/seen-store.js';

const marksSchema = z.record(z.string(), z.object({ seenUntil: z.string(), askedAt: z.string() }));

/**
 * `config/seen.json`: what the owner has been told, per app.
 *
 * Plain JSON rather than YAML, because nobody edits it by hand. A missing or
 * damaged file reads as empty: the worst outcome is that the next "what's new?"
 * starts tracking again, which is not worth refusing to answer over.
 */
export class JsonSeenStore implements SeenStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Readonly<Record<string, SeenMark>>> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch {
      return {};
    }
    try {
      const parsed = marksSchema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  /** Written to a temporary file and renamed, so a crash never leaves half a file. */
  async save(marks: Readonly<Record<string, SeenMark>>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(marks, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }
}
