import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { JsonSeenStore } from '../../../src/infrastructure/state/json-seen-store.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stackvoice-seen-'));
});

describe('JsonSeenStore', () => {
  it('reads nothing before anything was saved', async () => {
    expect(await new JsonSeenStore(join(dir, 'seen.json')).load()).toEqual({});
  });

  it('round-trips the marks, and a new store on the same file sees them', async () => {
    const path = join(dir, 'state', 'seen.json');
    const marks = { ideas: { seenUntil: '2026-10-16', askedAt: '2026-10-18T10:00:00.000Z' } };

    await new JsonSeenStore(path).save(marks);

    expect(await new JsonSeenStore(path).load()).toEqual(marks);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(marks);
  });

  it('reads a damaged file as empty rather than failing the answer', async () => {
    const path = join(dir, 'seen.json');
    await writeFile(path, '{ not json', 'utf8');
    expect(await new JsonSeenStore(path).load()).toEqual({});

    await writeFile(path, JSON.stringify({ ideas: { seenUntil: 5 } }), 'utf8');
    expect(await new JsonSeenStore(path).load()).toEqual({});
  });
});
