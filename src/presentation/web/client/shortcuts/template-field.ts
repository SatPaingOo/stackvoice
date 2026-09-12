import { h, uniqueId } from '../core/dom.js';
import { insertText } from './flow-hints.js';

export interface TemplateFieldOptions {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  /** The names a template can use right now. Asked each time the menu opens, so it is never stale. */
  readonly tokens: () => readonly string[];
  readonly className?: string;
}

/**
 * A line of text that can include names in braces, with an Insert menu of the
 * names that exist right now, so nobody has to remember what an answer was
 * called or how to read its first title.
 */
export class TemplateField {
  readonly element: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly insert: HTMLSelectElement;

  constructor(private readonly options: TemplateFieldOptions) {
    this.input = h('input', {
      className: 'mono',
      attrs: { type: 'text', spellcheck: 'false', id: uniqueId('template'), placeholder: options.placeholder ?? '' },
    });
    this.input.value = options.value;

    this.insert = h('select', { className: 'insert', attrs: { 'aria-label': `Insert a name into ${options.label}` } });
    this.refresh();
    this.insert.addEventListener('focus', () => this.refresh());
    this.insert.addEventListener('pointerdown', () => this.refresh());
    this.insert.addEventListener('change', () => this.put());

    this.element = h('div', { className: `field template ${options.className ?? ''}`.trim() }, [
      h('label', { text: options.label, attrs: { for: this.input.id } }),
      h('div', { className: 'template-row' }, [this.input, this.insert]),
    ]);
  }

  get value(): string {
    return this.input.value;
  }

  private refresh(): void {
    this.insert.replaceChildren(
      h('option', { text: 'Insert…', attrs: { value: '' } }),
      ...this.options.tokens().map((token) => h('option', { text: token, attrs: { value: token } })),
    );
  }

  private put(): void {
    const token = this.insert.value;
    if (token === '') return;
    const length = this.input.value.length;
    const next = insertText(this.input.value, token, this.input.selectionStart ?? length, this.input.selectionEnd ?? length);
    this.input.value = next.text;
    this.insert.value = '';
    this.input.focus();
    this.input.setSelectionRange(next.caret, next.caret);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
