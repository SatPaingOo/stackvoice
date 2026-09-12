import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import { BLOCK_LABELS, describeProblem } from './flow-hints.js';
import type { TryResult } from './shortcut-types.js';

/**
 * Runs the draft as it stands, with a value typed for each slot, and shows the
 * answer and every block that ran. Nothing is saved, so a flow is tested while
 * it is built rather than after it breaks.
 */
export class TryPanel {
  readonly element: HTMLElement;
  private readonly inputs = h('div', { className: 'try-inputs' });
  private readonly button = h('button', { className: 'small', text: 'Try it', attrs: { type: 'button', id: 'tryRun' } });
  private readonly notice = new Notice();
  private readonly answer = h('div', { className: 'try-answer', attrs: { id: 'tryAnswer', 'aria-live': 'polite' } });
  private readonly trace = h('ol', { className: 'trace', attrs: { id: 'tryTrace' } });
  private values = new Map<string, string>();
  private slots: readonly string[] | null = null;

  constructor(private readonly run: (inputs: Readonly<Record<string, string>>) => Promise<TryResult>) {
    this.button.addEventListener('click', () => void this.go());
    this.element = h('section', { className: 'try-panel' }, [
      h('h3', { text: 'Try it' }),
      h('p', { className: 'soft', text: 'Runs this draft as it is now, asking the real tools. Nothing is saved.' }),
      this.inputs,
      h('div', { className: 'row' }, [this.button]),
      this.notice.element,
      this.answer,
      this.trace,
    ]);
    this.reset();
  }

  setSlots(slots: readonly string[]): void {
    if (this.slots !== null && this.slots.join('|') === slots.join('|')) return;
    this.slots = [...slots];
    this.inputs.replaceChildren(
      ...slots.map((slot) => {
        const input = h('input', { className: 'mono', attrs: { type: 'text', id: `try-${slot}`, spellcheck: 'false' } });
        input.value = this.values.get(slot) ?? '';
        input.addEventListener('input', () => this.values.set(slot, input.value));
        return h('div', { className: 'field' }, [h('label', { text: `{${slot}}`, attrs: { for: input.id } }), input]);
      }),
    );
    this.inputs.hidden = slots.length === 0;
  }

  reset(): void {
    this.values = new Map();
    this.slots = null;
    this.setSlots([]);
    this.notice.clear();
    this.answer.hidden = true;
    this.trace.replaceChildren();
  }

  private async go(): Promise<void> {
    const inputs = Object.fromEntries((this.slots ?? []).map((slot) => [slot, this.values.get(slot) ?? '']));
    await whileBusy(this.button, 'Running...', async () => {
      try {
        const result = await this.run(inputs);
        this.notice.clear();
        this.answer.textContent = result.spoken;
        this.answer.hidden = false;
        this.trace.replaceChildren(
          ...result.trace.map((entry) =>
            h('li', { className: entry.ok ? 'ok' : 'failed' }, [
              h('span', { className: 'at', text: entry.at }),
              h('span', { className: `block-tag k-${entry.kind}`, text: BLOCK_LABELS[entry.kind].title }),
              h('span', { className: 'summary', text: entry.summary }),
              h('span', { className: 'ms', text: `${entry.ms} ms` }),
            ]),
          ),
        );
      } catch (error) {
        this.answer.hidden = true;
        this.trace.replaceChildren();
        this.notice.show('err', describeProblem(messageOf(error)));
      }
    });
  }
}
