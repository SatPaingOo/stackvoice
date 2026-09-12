import { h } from '../core/dom.js';

export type NoticeKind = 'info' | 'ok' | 'warn' | 'err';

/** One line of feedback: what just happened, or what to fix. Announced to screen readers. */
export class Notice {
  readonly element = h('div', { className: 'notice', attrs: { role: 'status', 'aria-live': 'polite' } });

  show(kind: NoticeKind, text: string): void {
    this.element.replaceChildren(h('div', { className: `note ${kind}`, text }));
  }

  clear(): void {
    this.element.replaceChildren();
  }
}
