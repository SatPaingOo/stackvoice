import { h } from '../core/dom.js';

/** The card shown where a list can legitimately be empty, saying what to do next. */
export function emptyState(title: string, body: string): HTMLDivElement {
  return h('div', { className: 'card empty' }, [h('h3', { text: title }), h('p', { className: 'soft', text: body })]);
}
