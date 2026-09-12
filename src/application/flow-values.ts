import { isFlowFunction, type Condition, type FlowFunction } from '../domain/flow.js';
import type { Item } from '../domain/item.js';
import { humanizeSince, listPhrase } from './response-shaper.js';

/**
 * What a flow's variables hold while it runs, and the functions that read them.
 *
 * Pure: the only outside input is `now`, passed in, so a date said as
 * "yesterday" is the same in a test as it is at 9am.
 */
export type FlowValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'number'; readonly value: number }
  /** What an Ask block saved: the tool's spoken answer and the entries behind it. */
  | { readonly kind: 'answer'; readonly spoken: string; readonly ok: boolean; readonly items: readonly Item[] }
  | { readonly kind: 'item'; readonly item: Item | null };

export type Variables = ReadonlyMap<string, FlowValue>;

export const NOTHING: FlowValue = { kind: 'text', text: '' };

const REFERENCE = /\{([a-z][a-z0-9_]*)((?:\.[a-z0-9_]+)*)\}/g;
/** Within a week, "3 days ago" says more than a date. Past that, the date is clearer. */
const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

/** A value as words. An answer reads as what the tool said; an entry as its title. */
export function textOf(value: FlowValue): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'number':
      return String(value.value);
    case 'answer':
      return value.spoken;
    case 'item':
      return value.item === null ? '' : value.item.title;
  }
}

export function countOf(value: FlowValue): number {
  switch (value.kind) {
    case 'answer':
      return value.items.length;
    case 'item':
      return value.item === null ? 0 : 1;
    case 'number':
      return value.value;
    case 'text':
      return value.text.trim() === '' ? 0 : 1;
  }
}

/** Reads one thing from a value. Reading a field of an answer reads it from the first entry. */
export function applyFunction(value: FlowValue, fn: FlowFunction, index: number | null, now: Date): FlowValue {
  const items = itemsOf(value);
  const first = value.kind === 'item' ? value.item : (items[0] ?? null);

  switch (fn) {
    case 'count':
      return { kind: 'number', value: countOf(value) };
    case 'first':
      return { kind: 'item', item: first };
    case 'last':
      return { kind: 'item', item: items[items.length - 1] ?? null };
    case 'item':
      return { kind: 'item', item: index === null ? null : (items[index - 1] ?? null) };
    case 'titles':
      if (value.kind === 'text') return value;
      return text(items.length === 0 ? '' : listPhrase(items.map((item) => cleanTitle(item.title))));
    case 'title':
      return text(first === null ? '' : cleanTitle(first.title));
    case 'summary':
      return text(first?.summary ?? '');
    case 'date':
      return value.kind === 'text' ? value : text(first?.date ?? '');
    case 'when':
      return text(describeWhen(value.kind === 'text' ? value.text : (first?.date ?? ''), now));
    case 'link':
      return text(first?.url ?? '');
    case 'topic':
      return text(first?.topic ?? '');
    case 'region':
      return text(first?.region ?? '');
    case 'key':
      return text(first?.key ?? '');
  }
}

/** Fills {name} and {name.function.function} with what the variables hold. A name nothing set reads as nothing. */
export function renderTemplate(template: string, variables: Variables, now: Date): string {
  return template.replace(REFERENCE, (_match, root: string, path: string) => {
    let value = variables.get(root) ?? NOTHING;
    for (const accessor of path.split('.').filter((part) => part !== '')) {
      value = isFlowFunction(accessor) ? applyFunction(value, accessor, null, now) : NOTHING;
    }
    return textOf(value);
  });
}

export function evaluateCondition(condition: Condition, variables: Variables, now: Date): boolean {
  switch (condition.kind) {
    case 'count': {
      const count = countOf(variables.get(condition.variable) ?? NOTHING);
      if (condition.op === 'is') return count === condition.value;
      return condition.op === 'more_than' ? count > condition.value : count < condition.value;
    }
    case 'text': {
      // Compared the way a person hears it: case and surrounding spaces do not matter.
      const actual = renderTemplate(condition.template, variables, now).trim().toLowerCase();
      const expected = renderTemplate(condition.value, variables, now).trim().toLowerCase();
      switch (condition.op) {
        case 'contains':
          return expected !== '' && actual.includes(expected);
        case 'is':
          return actual === expected;
        case 'is_empty':
          return actual === '';
        case 'is_not_empty':
          return actual !== '';
      }
      break;
    }
    case 'failed': {
      const value = variables.get(condition.variable);
      return value?.kind === 'answer' && !value.ok;
    }
  }
  return false;
}

/** A date as it is said: "yesterday", "on September 12", "in September 2026". */
export function describeWhen(raw: string, now: Date): string {
  const value = raw.trim();
  if (value === '') return '';

  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month !== null) {
    const date = new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1));
    return `in ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;

  const then = new Date(time);
  const age = now.getTime() - time;
  if (age >= 0 && age < RECENT_DAYS * DAY_MS) return humanizeSince(then, now);

  const sameYear = then.getUTCFullYear() === now.getUTCFullYear();
  return `on ${then.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })}`;
}

/** One line to speak: single spaces, and no space left before punctuation by an empty slot. */
export function tidy(spoken: string): string {
  return spoken.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

function itemsOf(value: FlowValue): readonly Item[] {
  if (value.kind === 'answer') return value.items;
  if (value.kind === 'item') return value.item === null ? [] : [value.item];
  return [];
}

function text(value: string): FlowValue {
  return { kind: 'text', text: value };
}

/** Feed titles often end in a full stop, which reads badly once the title sits inside a sentence. */
function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
}
