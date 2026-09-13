import { h, type Child } from '../core/dom.js';
import { slotsIn } from './flow-hints.js';

/** The ways to say a shortcut, and the slots they leave for the person to fill. */
export class TriggerListEditor {
  readonly element: HTMLDivElement;
  private readonly rows = h('div', { attrs: { id: 'phrases' } });
  private readonly addButton = h('button', {
    className: 'small',
    text: 'Add a phrase',
    attrs: { type: 'button', id: 'addPhrase' },
  });
  private readonly slotsLine = h('p', { className: 'slots-line', attrs: { id: 'slotsLine' } });
  private inputs: HTMLInputElement[] = [];

  constructor(
    private readonly max: number,
    private readonly onChange: () => void,
  ) {
    this.addButton.addEventListener('click', () => {
      this.addRow('');
      this.changed();
      this.inputs.at(-1)?.focus();
    });
    this.element = h('div', { className: 'field' }, [
      h('label', {}, [
        'Ways to say it',
        h('span', { className: 'hint', text: ' — a word in braces, such as {topic}, is filled in by the person' }),
      ]),
      this.rows,
      this.slotsLine,
      this.addButton,
    ]);
  }

  get value(): string[] {
    return this.inputs.map((input) => input.value.trim()).filter((phrase) => phrase !== '');
  }

  set value(phrases: readonly string[]) {
    this.inputs = [];
    this.rows.replaceChildren();
    for (const phrase of phrases.length > 0 ? phrases : ['']) this.addRow(phrase);
    this.showSlots();
  }

  slots(): string[] {
    return slotsIn(this.value);
  }

  private addRow(phrase: string): void {
    const input = h('input', {
      className: 'mono',
      attrs: { type: 'text', spellcheck: 'false', placeholder: 'news about {topic}', 'aria-label': 'A way to say it' },
    });
    input.value = phrase;
    input.addEventListener('input', () => this.changed());

    const row = h('div', { className: 'phrase-row' }, [input]);
    const remove = h('button', { className: 'small ghost', text: 'Remove', attrs: { type: 'button' } });
    remove.addEventListener('click', () => {
      this.inputs = this.inputs.filter((candidate) => candidate !== input);
      row.remove();
      if (this.inputs.length === 0) this.addRow('');
      this.changed();
    });
    row.append(remove);

    this.inputs.push(input);
    this.rows.append(row);
    this.addButton.disabled = this.inputs.length >= this.max;
  }

  private changed(): void {
    this.addButton.disabled = this.inputs.length >= this.max;
    this.showSlots();
    this.onChange();
  }

  private showSlots(): void {
    const slots = this.slots();
    let parts: Child[];
    if (slots.length > 0) {
      parts = ['The person fills in '];
      slots.forEach((slot, index) => parts.push(index === 0 ? '' : ', ', h('code', { text: `{${slot}}` })));
    } else {
      parts = [
        this.value.length === 0
          ? 'With no phrase, the name is what the person says.'
          : 'No slots: the phrase is said as it is.',
      ];
    }
    this.slotsLine.replaceChildren(
      ...parts.filter((part): part is Node | string => typeof part === 'string' || part instanceof Node),
    );
  }
}
