import { h } from '../core/dom.js';
import { createBlockEditor } from './block-editors.js';
import type { BlockEditor, BlockList, FlowContext } from './flow-context.js';
import { BLOCK_LABELS, BLOCK_ORDER } from './flow-hints.js';
import type { BlockKind, BlockWire } from './shortcut-types.js';

interface CardActions {
  move(card: BlockCard, by: number): void;
  remove(card: BlockCard): void;
}

/** One block in a list: what kind it is, the buttons that move it, and its editor. */
class BlockCard {
  readonly element: HTMLDivElement;
  private readonly up: HTMLButtonElement;
  private readonly down: HTMLButtonElement;

  constructor(
    readonly editor: BlockEditor,
    actions: CardActions,
  ) {
    const label = BLOCK_LABELS[editor.kind];
    this.up = iconButton('↑', 'Move up', () => actions.move(this, -1));
    this.down = iconButton('↓', 'Move down', () => actions.move(this, 1));
    const remove = iconButton('×', 'Remove block', () => actions.remove(this));
    remove.classList.add('danger');

    this.element = h('div', { className: `block-card k-${editor.kind}` }, [
      h('div', { className: 'block-head' }, [
        h('span', { className: 'block-tag', text: label.title }),
        h('span', { className: 'block-hint', text: label.hint }),
        this.up,
        this.down,
        remove,
      ]),
      h('div', { className: 'block-body' }, [editor.element]),
    ]);
  }

  place(index: number, count: number): void {
    this.up.disabled = index === 0;
    this.down.disabled = index === count - 1;
  }
}

/**
 * An ordered list of blocks with a row of buttons to add each kind: a whole flow,
 * or one branch of an If. It never knows what a block holds; each card's editor does.
 */
export class BlockListEditor implements BlockList {
  readonly element: HTMLDivElement;
  private readonly cards: BlockCard[] = [];
  private readonly list = h('div', { className: 'block-list' });
  private readonly empty = h('p', { className: 'block-empty', text: 'No blocks here yet.' });

  constructor(
    private readonly context: FlowContext,
    private readonly depth: number,
    blocks: readonly BlockWire[],
  ) {
    const adder = h('div', { className: 'block-adder' }, [
      h('span', { text: 'Add' }),
      ...BLOCK_ORDER.map((kind) => {
        const add = h('button', {
          className: `small k-${kind}`,
          text: BLOCK_LABELS[kind].title,
          attrs: { type: 'button', title: BLOCK_LABELS[kind].hint },
        });
        // An If in this list would sit deeper than a person can follow.
        add.disabled = kind === 'if' && depth > context.limits.maxDepth;
        add.addEventListener('click', () => this.add(kind));
        return add;
      }),
    ]);

    this.element = h('div', { className: 'block-list-editor' }, [this.list, adder]);
    for (const block of blocks) this.cards.push(this.card(block));
    this.render();
  }

  read(): BlockWire[] {
    return this.cards.map((card) => card.editor.read());
  }

  private add(kind: BlockKind): void {
    const card = this.card(this.context.starter(kind));
    this.cards.push(card);
    this.render();
    card.element.querySelector<HTMLElement>('.block-body input, .block-body select')?.focus();
    this.context.changed();
  }

  private card(block: BlockWire): BlockCard {
    return new BlockCard(createBlockEditor(block, this.context, this.depth), {
      move: (card, by) => this.move(card, by),
      remove: (card) => this.remove(card),
    });
  }

  private move(card: BlockCard, by: number): void {
    const from = this.cards.indexOf(card);
    const to = from + by;
    if (from < 0 || to < 0 || to >= this.cards.length) return;
    this.cards.splice(from, 1);
    this.cards.splice(to, 0, card);
    this.render();
    this.context.changed();
  }

  private remove(card: BlockCard): void {
    this.cards.splice(this.cards.indexOf(card), 1);
    this.render();
    this.context.changed();
  }

  private render(): void {
    this.list.replaceChildren(...(this.cards.length === 0 ? [this.empty] : this.cards.map((card) => card.element)));
    this.cards.forEach((card, index) => card.place(index, this.cards.length));
  }
}

function iconButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  return h('button', {
    className: 'small ghost',
    text,
    attrs: { type: 'button', 'aria-label': label, title: label },
    on: { click: onClick },
  });
}
