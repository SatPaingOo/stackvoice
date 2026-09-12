import { h } from '../core/dom.js';
import { parseArgs } from './shortcut-hints.js';
import type { ShortcutStepWire, ToolWire } from './shortcut-types.js';
import { StepRow } from './step-row.js';

export type StepsResult =
  | { readonly ok: true; readonly steps: readonly ShortcutStepWire[] }
  | { readonly ok: false; readonly problem: string };

/** The ordered steps of a shortcut, up to the most the server allows. */
export class StepList {
  readonly element: HTMLDivElement;
  private readonly rows: StepRow[] = [];
  private readonly container = h('div', { attrs: { id: 'steps' } });
  private readonly addButton = h('button', { className: 'small', text: 'Add a step', attrs: { type: 'button', id: 'addStep' } });
  private tools: readonly ToolWire[] = [];

  constructor(private readonly maxSteps: number) {
    this.addButton.addEventListener('click', () => {
      this.add(null);
      this.element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    this.element = h('div', { className: 'field' }, [
      h('label', {}, ['Steps', h('span', { className: 'hint', text: ` — run in order, at most ${maxSteps}` })]),
      this.container,
      this.addButton,
    ]);
  }

  setTools(tools: readonly ToolWire[]): void {
    this.tools = tools;
  }

  /** Replaces the rows. An empty shortcut starts with one blank step to fill in. */
  set value(steps: readonly ShortcutStepWire[]) {
    this.rows.splice(0);
    this.container.replaceChildren();
    for (const step of steps.length > 0 ? steps : [null]) this.add(step);
  }

  read(): StepsResult {
    if (this.rows.length === 0) return { ok: false, problem: 'A shortcut needs at least one step.' };

    const steps: ShortcutStepWire[] = [];
    for (const [index, row] of this.rows.entries()) {
      const draft = row.read();
      const parsed = parseArgs(draft.argsText);
      if (!parsed.ok) return { ok: false, problem: `The arguments of step ${index + 1} ${parsed.problem}.` };
      steps.push({ tool: draft.tool, args: parsed.args });
    }
    return { ok: true, steps };
  }

  private add(step: ShortcutStepWire | null): void {
    const row = new StepRow(this.tools, step, (removed) => this.remove(removed));
    this.rows.push(row);
    this.container.append(row.element);
    this.renumber();
  }

  private remove(row: StepRow): void {
    this.rows.splice(this.rows.indexOf(row), 1);
    row.element.remove();
    this.renumber();
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private renumber(): void {
    this.rows.forEach((row, index) => {
      row.position = index + 1;
    });
    this.addButton.disabled = this.rows.length >= this.maxSteps;
  }
}
