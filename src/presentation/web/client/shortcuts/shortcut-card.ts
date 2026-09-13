import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import { countBlocks, phraseParts } from './flow-hints.js';
import type { ShortcutWire } from './shortcut-types.js';

export interface ShortcutCardActions {
  edit(shortcut: ShortcutWire): void;
  remove(shortcut: ShortcutWire): Promise<void>;
}

/** One shortcut: the ways to say it with its slots marked, and what its flow asks. */
export class ShortcutCard {
  readonly element: HTMLDivElement;

  constructor(shortcut: ShortcutWire, actions: ShortcutCardActions) {
    const phrases = (shortcut.triggers.length > 0 ? shortcut.triggers : [shortcut.name]).map((phrase) =>
      h(
        'span',
        { className: 'chip phrase-chip' },
        phraseParts(phrase).map((part) => (part.slot ? h('span', { className: 'slot', text: part.text }) : part.text)),
      ),
    );
    const blocks = countBlocks(shortcut.blocks);

    const main = h('div', { className: 'main' }, [
      h('h3', { text: shortcut.name }),
      h('p', { className: 'soft', text: shortcut.description === '' ? 'No description' : shortcut.description }),
      h('div', { className: 'chips' }, [h('span', { className: 'muted', text: 'Say' }), ...phrases]),
      h('div', { className: 'chips' }, [
        h('span', { className: 'chip', text: shortcut.toolName }),
        h('span', {
          className: 'muted',
          text: `${blocks} ${blocks === 1 ? 'block' : 'blocks'}${shortcut.tools.length === 0 ? '' : ', asking'}`,
        }),
        ...shortcut.tools.map((tool) => h('span', { className: 'chip', text: tool })),
      ]),
    ]);

    const edit = h('button', {
      className: 'small',
      text: 'Edit',
      attrs: { type: 'button' },
      on: { click: () => actions.edit(shortcut) },
    });
    const remove = h('button', { className: 'small danger', text: 'Remove', attrs: { type: 'button' } });
    remove.addEventListener('click', () => void whileBusy(remove, '...', () => actions.remove(shortcut)));

    this.element = h('div', { className: 'card item', dataset: { shortcut: shortcut.toolName } }, [
      main,
      h('div', { className: 'actions' }, [edit, remove]),
    ]);
  }
}
