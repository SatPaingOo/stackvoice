import { labelled } from '../components/form-controls.js';
import { h } from '../core/dom.js';
import type { FlowContext } from './flow-context.js';
import { NameSelect } from './name-select.js';
import type { ConditionWire, CountOperator, TextOperator } from './shortcut-types.js';
import { TemplateField } from './template-field.js';

type ConditionKind = ConditionWire['kind'];

const KINDS: readonly (readonly [ConditionKind, string])[] = [
  ['count', 'how many entries an answer has'],
  ['text', 'what some text says'],
  ['failed', 'whether a tool failed'],
];

const COUNT_OPS: readonly (readonly [CountOperator, string])[] = [
  ['is', 'is exactly'],
  ['more_than', 'is more than'],
  ['less_than', 'is fewer than'],
];

const TEXT_OPS: readonly (readonly [TextOperator, string])[] = [
  ['contains', 'contains'],
  ['is', 'is'],
  ['is_empty', 'is empty'],
  ['is_not_empty', 'is not empty'],
];

/** What an If block checks: a count, some text, or a failed tool. Each has its own fields, shown one at a time. */
export class ConditionEditor {
  readonly element: HTMLDivElement;
  private readonly kind = select('condition-kind', KINDS);
  private readonly countOf: NameSelect;
  private readonly countOp = select('condition-count-op', COUNT_OPS);
  private readonly countValue = h('input', { className: 'condition-number', attrs: { type: 'number', min: '0', max: '1000' } });
  private readonly template: TemplateField;
  private readonly textOp = select('condition-text-op', TEXT_OPS);
  private readonly value: TemplateField;
  private readonly failedOf: NameSelect;
  private readonly boxes: Readonly<Record<ConditionKind, HTMLDivElement>>;

  constructor(condition: ConditionWire, context: FlowContext) {
    this.kind.value = condition.kind;
    this.countOf = new NameSelect(condition.kind === 'count' ? condition.variable : '', () => context.answers(), 'condition-variable');
    this.countOp.value = condition.kind === 'count' ? condition.op : 'is';
    this.countValue.value = condition.kind === 'count' ? String(condition.value) : '0';
    this.template = new TemplateField({
      label: 'The text',
      value: condition.kind === 'text' ? condition.template : '',
      placeholder: '{answer.first.title}',
      tokens: () => context.tokens(),
      className: 'condition-template',
    });
    this.textOp.value = condition.kind === 'text' ? condition.op : 'contains';
    this.value = new TemplateField({
      label: 'This',
      value: condition.kind === 'text' ? condition.value : '',
      placeholder: 'gold',
      tokens: () => context.tokens(),
      className: 'condition-value',
    });
    this.failedOf = new NameSelect(condition.kind === 'failed' ? condition.variable : '', () => context.answers(), 'condition-failed');

    this.boxes = {
      count: h('div', { className: 'block-grid' }, [
        labelled('Answer', this.countOf.element),
        labelled('Count', this.countOp),
        labelled('Number', this.countValue),
      ]),
      text: h('div', { className: 'block-grid' }, [this.template.element, labelled('Check', this.textOp), this.value.element]),
      failed: h('div', { className: 'block-grid' }, [labelled('Answer', this.failedOf.element)]),
    };

    this.element = h('div', { className: 'condition' }, [
      labelled('If it depends on', this.kind),
      this.boxes.count,
      this.boxes.text,
      this.boxes.failed,
    ]);
    this.kind.addEventListener('change', () => this.show());
    this.textOp.addEventListener('change', () => this.show());
    this.show();
  }

  read(): ConditionWire {
    switch (this.kind.value as ConditionKind) {
      case 'count':
        return {
          kind: 'count',
          variable: this.countOf.value,
          op: this.countOp.value as CountOperator,
          value: Number(this.countValue.value),
        };
      case 'text': {
        const op = this.textOp.value as TextOperator;
        return { kind: 'text', template: this.template.value, op, value: op === 'contains' || op === 'is' ? this.value.value : '' };
      }
      case 'failed':
        return { kind: 'failed', variable: this.failedOf.value };
    }
  }

  private show(): void {
    const kind = this.kind.value as ConditionKind;
    for (const [name, box] of Object.entries(this.boxes)) box.hidden = name !== kind;
    const op = this.textOp.value;
    this.value.element.hidden = !(op === 'contains' || op === 'is');
  }
}

function select<T extends string>(className: string, options: readonly (readonly [T, string])[]): HTMLSelectElement {
  return h(
    'select',
    { className },
    options.map(([value, text]) => h('option', { text, attrs: { value } })),
  );
}
