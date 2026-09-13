import { labelled } from '../components/form-controls.js';
import { h } from '../core/dom.js';
import { ConditionEditor } from './condition-editor.js';
import type { BlockEditor, BlockList, FlowContext } from './flow-context.js';
import { FUNCTION_LABELS } from './flow-hints.js';
import { NameSelect } from './name-select.js';
import type { ArgValue, BlockKind, BlockWire, FlowFunction, ToolWire } from './shortcut-types.js';
import { TemplateField } from './template-field.js';

type Of<K extends BlockKind> = Extract<BlockWire, { kind: K }>;

/** The arguments an Ask block shows fields for. Anything else it was saved with is kept as it was. */
const EDITED_ARGS = ['query', 'limit', 'key'];

class AskBlockEditor implements BlockEditor {
  readonly kind = 'ask';
  readonly element: HTMLDivElement;
  private readonly tool = h('select', { className: 'ask-tool' });
  private readonly query: TemplateField;
  private readonly limit = h('input', { className: 'ask-limit', attrs: { type: 'number', min: '1', max: '10' } });
  private readonly key: TemplateField;
  private readonly as = h('input', { className: 'ask-as mono', attrs: { type: 'text', spellcheck: 'false' } });
  private readonly searchRow: HTMLDivElement;

  constructor(
    private readonly block: Of<'ask'>,
    private readonly context: FlowContext,
  ) {
    const names = context.tools().map((tool) => tool.name);
    if (block.tool !== '' && !names.includes(block.tool)) names.unshift(block.tool);
    this.tool.append(...names.map((name) => h('option', { text: name, attrs: { value: name } })));
    this.tool.value = block.tool;

    this.query = new TemplateField({
      label: 'Search for',
      value: textArg(block.args['query']),
      placeholder: '{topic}, or empty for the newest',
      tokens: () => context.tokens(),
      className: 'ask-query',
    });
    this.key = new TemplateField({
      label: 'Entry key',
      value: textArg(block.args['key']),
      placeholder: '{answer.first.key}',
      tokens: () => context.tokens(),
      className: 'ask-key',
    });
    this.limit.value = typeof block.args['limit'] === 'number' ? String(block.args['limit']) : '3';
    this.as.value = block.as;

    this.searchRow = h('div', { className: 'block-grid' }, [this.query.element, labelled('How many', this.limit)]);
    this.element = h('div', {}, [
      h('div', { className: 'block-grid' }, [labelled('Tool', this.tool), labelled('Save the answer as', this.as)]),
      this.searchRow,
      this.key.element,
    ]);

    this.tool.addEventListener('change', () => {
      this.showFields();
      context.changed();
    });
    this.as.addEventListener('change', () => context.changed());
    this.showFields();
  }

  read(): BlockWire {
    const tool = this.selected();
    // A tool this server no longer has keeps the arguments it was saved with.
    if (tool === undefined)
      return { kind: 'ask', tool: this.tool.value, args: this.block.args, as: this.as.value.trim() };

    const args: Record<string, ArgValue> = {};
    for (const [key, value] of Object.entries(this.block.args)) {
      if (!EDITED_ARGS.includes(key)) args[key] = value;
    }
    if (tool.takesQuery) {
      if (this.query.value.trim() !== '') args['query'] = this.query.value.trim();
      const limit = Number(this.limit.value);
      if (Number.isInteger(limit) && limit >= 1) args['limit'] = limit;
    }
    if (tool.needsKey && this.key.value.trim() !== '') args['key'] = this.key.value.trim();
    return { kind: 'ask', tool: tool.name, args, as: this.as.value.trim() };
  }

  private selected(): ToolWire | undefined {
    return this.context.tools().find((tool) => tool.name === this.tool.value);
  }

  private showFields(): void {
    const tool = this.selected();
    this.searchRow.hidden = tool?.takesQuery !== true;
    this.key.element.hidden = tool?.needsKey !== true;
  }
}

class IfBlockEditor implements BlockEditor {
  readonly kind = 'if';
  readonly element: HTMLDivElement;
  private readonly condition: ConditionEditor;
  private readonly then: BlockList;
  private readonly otherwise: BlockList;

  constructor(block: Of<'if'>, context: FlowContext, depth: number) {
    this.condition = new ConditionEditor(block.condition, context);
    this.then = context.createList(depth + 1, block.then);
    this.otherwise = context.createList(depth + 1, block.otherwise);
    this.element = h('div', {}, [
      this.condition.element,
      h('div', { className: 'branch then' }, [h('p', { className: 'branch-label', text: 'Then' }), this.then.element]),
      h('div', { className: 'branch otherwise' }, [
        h('p', { className: 'branch-label', text: 'Otherwise' }),
        this.otherwise.element,
      ]),
    ]);
  }

  read(): BlockWire {
    return { kind: 'if', condition: this.condition.read(), then: this.then.read(), otherwise: this.otherwise.read() };
  }
}

class SayBlockEditor implements BlockEditor {
  readonly kind = 'say';
  readonly element: HTMLElement;
  private readonly text: TemplateField;

  constructor(block: Of<'say'>, context: FlowContext) {
    this.text = new TemplateField({
      label: 'Say',
      value: block.text,
      placeholder: 'Nothing about {topic} yet.',
      tokens: () => context.tokens(),
      className: 'say-text',
    });
    this.element = this.text.element;
  }

  read(): BlockWire {
    return { kind: 'say', text: this.text.value };
  }
}

class GetBlockEditor implements BlockEditor {
  readonly kind = 'get';
  readonly element: HTMLDivElement;
  private readonly fn = h('select', { className: 'get-fn' });
  private readonly from: NameSelect;
  private readonly index = h('input', { className: 'get-index', attrs: { type: 'number', min: '1', max: '50' } });
  private readonly indexField: HTMLDivElement;
  private readonly as = h('input', { className: 'get-as mono', attrs: { type: 'text', spellcheck: 'false' } });

  constructor(block: Of<'get'>, context: FlowContext) {
    this.fn.append(
      ...(Object.keys(FUNCTION_LABELS) as FlowFunction[]).map((fn) =>
        h('option', { text: FUNCTION_LABELS[fn], attrs: { value: fn } }),
      ),
    );
    this.fn.value = block.fn;
    this.from = new NameSelect(block.from, () => context.values(), 'get-from');
    this.index.value = block.index === null ? '1' : String(block.index);
    this.as.value = block.as;
    this.indexField = labelled('Which one', this.index);

    this.element = h('div', { className: 'block-grid' }, [
      labelled('Get', this.fn),
      labelled('From', this.from.element),
      this.indexField,
      labelled('Save it as', this.as),
    ]);
    this.fn.addEventListener('change', () => this.showIndex());
    this.as.addEventListener('change', () => context.changed());
    this.showIndex();
  }

  read(): BlockWire {
    const fn = this.fn.value as FlowFunction;
    const index = Number(this.index.value);
    return {
      kind: 'get',
      fn,
      from: this.from.value,
      index: fn === 'item' && Number.isInteger(index) ? index : null,
      as: this.as.value.trim(),
    };
  }

  private showIndex(): void {
    this.indexField.hidden = this.fn.value !== 'item';
  }
}

class SetBlockEditor implements BlockEditor {
  readonly kind = 'set';
  readonly element: HTMLDivElement;
  private readonly name = h('input', { className: 'set-name mono', attrs: { type: 'text', spellcheck: 'false' } });
  private readonly to: TemplateField;

  constructor(block: Of<'set'>, context: FlowContext) {
    this.name.value = block.name;
    this.to = new TemplateField({
      label: 'To',
      value: block.to,
      placeholder: 'Anything, with {names} in it',
      tokens: () => context.tokens(),
      className: 'set-to',
    });
    this.element = h('div', { className: 'block-grid' }, [labelled('Name', this.name), this.to.element]);
    this.name.addEventListener('change', () => context.changed());
  }

  read(): BlockWire {
    return { kind: 'set', name: this.name.value.trim(), to: this.to.value };
  }
}

class StopBlockEditor implements BlockEditor {
  readonly kind = 'stop';
  readonly element = h('p', {
    className: 'muted stop-note',
    text: 'The answer ends here, with what has been said so far.',
  });

  read(): BlockWire {
    return { kind: 'stop' };
  }
}

/**
 * The editor for a block. A new kind of block is one class above and one case
 * here; the list that holds editors never changes.
 */
export function createBlockEditor(block: BlockWire, context: FlowContext, depth: number): BlockEditor {
  switch (block.kind) {
    case 'ask':
      return new AskBlockEditor(block, context);
    case 'if':
      return new IfBlockEditor(block, context, depth);
    case 'say':
      return new SayBlockEditor(block, context);
    case 'get':
      return new GetBlockEditor(block, context);
    case 'set':
      return new SetBlockEditor(block, context);
    case 'stop':
      return new StopBlockEditor();
  }
}

function textArg(value: ArgValue | undefined): string {
  return typeof value === 'string' ? value : '';
}
