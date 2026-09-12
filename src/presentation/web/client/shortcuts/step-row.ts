import { h } from '../core/dom.js';
import type { ShortcutStepWire, ToolWire } from './shortcut-types.js';

export interface StepDraft {
  readonly tool: string;
  readonly argsText: string;
}

/** One step: which tool to run, and the arguments to run it with. */
export class StepRow {
  readonly element: HTMLDivElement;
  private readonly number = h('span', { className: 'num' });
  private readonly tool = h('select', { attrs: { 'aria-label': 'Tool to run' } });
  private readonly args = h('input', {
    className: 'mono',
    attrs: { type: 'text', spellcheck: 'false', placeholder: 'arguments, e.g. {"limit": 2}', 'aria-label': 'Arguments' },
  });

  constructor(tools: readonly ToolWire[], step: ShortcutStepWire | null, onRemove: (row: StepRow) => void) {
    this.tool.append(...tools.map((tool) => h('option', { text: tool.name, attrs: { value: tool.name } })));
    if (step !== null) this.tool.value = step.tool;
    this.args.value = step === null ? '{}' : JSON.stringify(step.args);

    // A search with no limit reads out everything it finds; start it at two.
    this.tool.addEventListener('change', () => {
      const picked = tools.find((tool) => tool.name === this.tool.value);
      if (picked?.takesQuery === true && this.args.value.trim() === '{}') this.args.value = '{"limit": 2}';
    });

    const remove = h('button', {
      className: 'small ghost drop',
      text: 'Remove',
      attrs: { type: 'button' },
      on: { click: () => onRemove(this) },
    });
    this.element = h('div', { className: 'step' }, [this.number, this.tool, this.args, remove]);
  }

  set position(position: number) {
    this.number.textContent = String(position);
  }

  read(): StepDraft {
    return { tool: this.tool.value, argsText: this.args.value };
  }
}
