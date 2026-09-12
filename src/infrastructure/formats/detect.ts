import type { DataFormat } from '../../domain/data-source.js';

const SNIFF_CHARS = 4096;

/**
 * Works out what a body is from the body itself, using the content type only
 * when the bytes cannot decide.
 *
 * Servers misreport content types constantly: raw.githubusercontent.com serves
 * CSV as text/plain, and plenty of APIs send JSON as text/html. So the bytes
 * come first.
 *
 * @returns null for anything StackVoice cannot read. Most importantly that
 * includes an ordinary web page, which should be reported as a web page rather
 * than mis-parsed into nonsense.
 */
export function detectFormat(body: string, contentType: string | null = null): DataFormat | null {
  const trimmed = body.replace(/^﻿/, '').trimStart();
  const head = trimmed.slice(0, SNIFF_CHARS);
  if (head === '') return null;

  const first = head[0];
  if (first === '{' || first === '[') return 'json';

  if (first === '<') {
    const lower = head.toLowerCase();
    if (lower.startsWith('<!doctype html') || /<html[\s>]/.test(lower)) return null;
    if (/<rss[\s>]/.test(lower) || /<rdf:rdf[\s>]/.test(lower)) return 'rss';
    if (/<feed[\s>]/.test(lower)) return 'atom';
    return null;
  }

  if (looksLikeCsv(head, trimmed.length > SNIFF_CHARS)) return 'csv';
  if ((contentType ?? '').toLowerCase().includes('csv')) return 'csv';
  return null;
}

/** A header line and at least one row, all splitting into the same number of cells. */
function looksLikeCsv(head: string, truncated: boolean): boolean {
  let lines = head.split(/\r?\n/).filter((line) => line.trim() !== '');
  // A sample cut off mid-line would under-count its last row, so it does not vote.
  if (truncated) lines = lines.slice(0, -1);
  lines = lines.slice(0, 8);
  if (lines.length < 2) return false;

  const delimiter = detectDelimiter(lines[0] as string);
  if (delimiter === null) return false;

  const expected = countCells(lines[0] as string, delimiter);
  return expected >= 2 && lines.slice(1).every((line) => countCells(line, delimiter) === expected);
}

/** The delimiter that splits a header line into the most cells, or null if none does. */
export function detectDelimiter(line: string): ',' | ';' | '\t' | null {
  let best: ',' | ';' | '\t' | null = null;
  let bestCells = 1;
  for (const candidate of [',', ';', '\t'] as const) {
    const cells = countCells(line, candidate);
    if (cells > bestCells) {
      best = candidate;
      bestCells = cells;
    }
  }
  return best;
}

/** Cells on one line, treating a delimiter inside double quotes as text. */
function countCells(line: string, delimiter: string): number {
  let cells = 1;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells += 1;
    }
  }
  return cells;
}
