import { h } from '../core/dom.js';

/**
 * A choice among the names a flow has saved, refreshed whenever it is opened.
 * A name that no longer exists stays selected, so the server can say what is
 * wrong with it instead of the builder quietly picking another.
 */
export class NameSelect {
  readonly element: HTMLSelectElement;

  constructor(
    value: string,
    private readonly names: () => readonly string[],
    className: string,
  ) {
    this.element = h('select', { className });
    this.fill(value);
    this.element.addEventListener('focus', () => this.fill(this.element.value));
    this.element.addEventListener('pointerdown', () => this.fill(this.element.value));
  }

  get value(): string {
    return this.element.value;
  }

  private fill(current: string): void {
    const names = [...new Set(this.names())];
    if (current !== '' && !names.includes(current)) names.unshift(current);
    this.element.replaceChildren(
      ...(names.length === 0
        ? [h('option', { text: 'nothing saved yet', attrs: { value: '' } })]
        : names.map((name) => h('option', { text: name, attrs: { value: name } }))),
    );
    this.element.value = current !== '' ? current : (names[0] ?? '');
  }
}
