import { h } from '../core/dom.js';
import { FIELD_NAMES, type FieldMapWire, type FieldName } from './app-types.js';
import { addColumn } from './source-hints.js';

const LABELS: Readonly<Record<FieldName, string>> = {
  title: 'title',
  summary: 'summary',
  date: 'date',
  key: 'key',
  topic: 'topic',
  region: 'region',
  url: 'link',
};

/**
 * Which column feeds each spoken field.
 *
 * An example from the data sits beside every field, and the data's own columns
 * are buttons, so a person picks what looks right instead of typing paths.
 */
export class FieldMapEditor {
  readonly element: HTMLDivElement;
  private readonly inputs = new Map<FieldName, HTMLInputElement>();
  private readonly samples = new Map<FieldName, HTMLDivElement>();
  private readonly columns = h('div', { className: 'picks', attrs: { id: 'columns' } });
  private readonly columnsBox: HTMLDivElement;
  private target: HTMLInputElement | null = null;

  constructor() {
    const grid = h(
      'div',
      { className: 'map', attrs: { id: 'fields' } },
      ['Field', 'Read from', 'Example'].map((text) => h('div', { className: 'head', text })),
    );

    for (const name of FIELD_NAMES) {
      const input = h('input', {
        attrs: { type: 'text', spellcheck: 'false', placeholder: 'not set', 'aria-label': `${LABELS[name]} is read from` },
        dataset: { name },
        on: { focus: () => this.aim(input) },
      });
      const sample = h('div', { className: 'sample' });
      this.inputs.set(name, input);
      this.samples.set(name, sample);
      grid.append(h('div', { className: 'name', text: LABELS[name] }), input, sample);
    }

    this.columnsBox = h('div', { className: 'columns' }, [
      h('p', { className: 'muted', text: 'Columns in this data. Click one to put it in the field you picked last.' }),
      this.columns,
    ]);
    this.columnsBox.hidden = true;

    this.element = h('div', { className: 'field' }, [
      h('label', {}, ['Where each spoken field lives', h('span', { className: 'hint', text: ' — one column, or several such as {Date}: {Price}' })]),
      grid,
      this.columnsBox,
    ]);
  }

  get value(): FieldMapWire {
    const read = (name: FieldName): string | null => {
      const text = this.inputs.get(name)?.value.trim() ?? '';
      return text === '' ? null : text;
    };
    return {
      title: read('title'),
      summary: read('summary'),
      date: read('date'),
      key: read('key'),
      topic: read('topic'),
      region: read('region'),
      url: read('url'),
    };
  }

  set value(fields: FieldMapWire) {
    for (const name of FIELD_NAMES) {
      const input = this.inputs.get(name);
      if (input !== undefined) input.value = fields[name] ?? '';
    }
    this.aim(null);
  }

  showSamples(samples: ReadonlyMap<string, string | null>): void {
    for (const name of FIELD_NAMES) {
      const cell = this.samples.get(name);
      if (cell !== undefined) cell.textContent = samples.get(name) ?? '';
    }
  }

  showColumns(keys: readonly string[]): void {
    this.columns.replaceChildren(
      ...keys.map((key) => h('button', { className: 'small', text: key, attrs: { type: 'button' }, on: { click: () => this.put(key) } })),
    );
    this.columnsBox.hidden = keys.length === 0;
  }

  onInput(listener: () => void): void {
    for (const input of this.inputs.values()) input.addEventListener('input', listener);
  }

  private put(column: string): void {
    const input = this.target ?? this.inputs.get('title');
    if (input === undefined) return;
    input.value = addColumn(input.value, column);
    input.dispatchEvent(new Event('input'));
    input.focus();
  }

  /** The field a column button fills. Marked, because the focus ring leaves when the button is clicked. */
  private aim(input: HTMLInputElement | null): void {
    this.target?.classList.remove('picked');
    this.target = input;
    input?.classList.add('picked');
  }
}
