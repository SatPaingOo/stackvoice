import { whileBusy } from '../core/busy.js';
import { h, type Child } from '../core/dom.js';
import type { ShortcutWire } from './shortcut-types.js';

export interface ShortcutCardActions {
  edit(shortcut: ShortcutWire): void;
  remove(shortcut: ShortcutWire): Promise<void>;
}

/** One shortcut: the phrase, what it is for, and the tools it runs in order. */
export class ShortcutCard {
  readonly element: HTMLDivElement;

  constructor(shortcut: ShortcutWire, actions: ShortcutCardActions) {
    const runs: Child[] = [];
    shortcut.steps.forEach((step, index) => {
      if (index > 0) runs.push(h('span', { className: 'muted', text: '→' }));
      runs.push(h('span', { className: 'chip', text: step.tool }));
    });

    const main = h('div', { className: 'main' }, [
      h('h3', { text: shortcut.name }),
      h('p', { className: 'soft', text: shortcut.description === '' ? 'No description' : shortcut.description }),
      h('div', { className: 'chips' }, [
        h('span', { className: 'chip', text: shortcut.toolName }),
        h('span', { className: 'muted', text: 'runs' }),
        ...runs,
      ]),
    ]);

    const edit = h('button', { className: 'small', text: 'Edit', attrs: { type: 'button' }, on: { click: () => actions.edit(shortcut) } });
    const remove = h('button', { className: 'small danger', text: 'Remove', attrs: { type: 'button' } });
    remove.addEventListener('click', () => void whileBusy(remove, '...', () => actions.remove(shortcut)));

    this.element = h('div', { className: 'card item', dataset: { shortcut: shortcut.toolName } }, [
      main,
      h('div', { className: 'actions' }, [edit, remove]),
    ]);
  }
}
