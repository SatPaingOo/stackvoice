import { h, uniqueId } from '../core/dom.js';

/**
 * What a form needs from any control: read it, write it, hear when it changes.
 * Every control below honours the same contract, so a form can hold them in one
 * list and never ask which kind it has.
 */
export interface FormControl<T> {
  readonly element: HTMLElement;
  value: T;
  onInput(listener: () => void): void;
  focus(): void;
}

export interface FieldOptions {
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  /** Paths, addresses and names read better in a monospace face. */
  readonly mono?: boolean;
  /** A stable id, for the label and for tests. Generated when absent. */
  readonly id?: string;
}

type NativeControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** A label, an optional hint, and the control it describes. */
abstract class LabeledField<T, C extends NativeControl> implements FormControl<T> {
  readonly element: HTMLDivElement;

  protected constructor(
    readonly control: C,
    options: FieldOptions,
  ) {
    control.id = options.id ?? uniqueId('field');
    if (options.mono === true) control.classList.add('mono');
    if ('placeholder' in control && options.placeholder !== undefined) control.placeholder = options.placeholder;

    const label = h('label', { attrs: { for: control.id } }, [
      options.label,
      options.hint === undefined ? null : h('span', { className: 'hint', text: ` — ${options.hint}` }),
    ]);
    this.element = h('div', { className: 'field' }, [label, control]);
  }

  abstract get value(): T;
  abstract set value(value: T);

  set disabled(disabled: boolean) {
    this.control.disabled = disabled;
  }

  onInput(listener: () => void): void {
    this.control.addEventListener('input', listener);
    this.control.addEventListener('change', listener);
  }

  focus(): void {
    this.control.focus();
  }
}

export class TextField extends LabeledField<string, HTMLInputElement> {
  constructor(options: FieldOptions & { readonly type?: 'text' | 'password' }) {
    const input = h('input', { attrs: { type: options.type ?? 'text', spellcheck: 'false', autocomplete: 'off' } });
    if (options.type === 'password') input.autocomplete = 'new-password';
    super(input, options);
  }

  get value(): string {
    return this.control.value;
  }

  set value(value: string) {
    this.control.value = value;
  }
}

export class TextAreaField extends LabeledField<string, HTMLTextAreaElement> {
  constructor(options: FieldOptions) {
    super(h('textarea'), options);
  }

  get value(): string {
    return this.control.value;
  }

  set value(value: string) {
    this.control.value = value;
  }
}

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export class SelectField extends LabeledField<string, HTMLSelectElement> {
  constructor(options: FieldOptions & { readonly choices: readonly Choice[] }) {
    super(h('select'), options);
    this.setChoices(options.choices);
  }

  setChoices(choices: readonly Choice[]): void {
    const current = this.control.value;
    this.control.replaceChildren(...choices.map((choice) => h('option', { text: choice.label, attrs: { value: choice.value } })));
    if (choices.some((choice) => choice.value === current)) this.control.value = current;
  }

  get value(): string {
    return this.control.value;
  }

  set value(value: string) {
    this.control.value = value;
  }
}

/** A label over a control built elsewhere, such as a select a block editor fills itself. */
export function labelled(text: string, control: HTMLElement, className = ''): HTMLDivElement {
  if (control.id === '') control.id = uniqueId('field');
  return h('div', { className: `field ${className}`.trim() }, [h('label', { text, attrs: { for: control.id } }), control]);
}

/** A checkbox with its label beside it, for a yes-or-no setting. */
export class SwitchField implements FormControl<boolean> {
  readonly element: HTMLLabelElement;
  private readonly input: HTMLInputElement;

  constructor(label: string, id?: string) {
    this.input = h('input', { attrs: { type: 'checkbox', id: id ?? uniqueId('switch') } });
    this.element = h('label', { className: 'switch' }, [this.input, ` ${label}`]);
  }

  get value(): boolean {
    return this.input.checked;
  }

  set value(value: boolean) {
    this.input.checked = value;
  }

  onInput(listener: () => void): void {
    this.input.addEventListener('change', listener);
  }

  focus(): void {
    this.input.focus();
  }
}
