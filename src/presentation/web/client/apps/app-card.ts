import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import type { AppWire } from './app-types.js';
import { kindOf } from './source-hints.js';

/** What a card can ask its owner to do. The card itself never talks to the server. */
export interface AppCardActions {
  edit(app: AppWire): void;
  toggle(app: AppWire): Promise<void>;
  remove(app: AppWire): Promise<void>;
}

/** One connected app: where it reads from, whether it is healthy, and the tools it gives the assistant. */
export class AppCard {
  readonly element: HTMLDivElement;

  constructor(app: AppWire, actions: AppCardActions) {
    const main = h('div', { className: 'main' }, [
      h('h3', { text: app.label }),
      h('p', { className: 'meta' }, [h('span', { className: 'kind-tag', text: kindOf(app.location) }), app.from]),
      h('div', { className: 'health' }, [
        h('span', { className: `dot ${!app.enabled ? '' : app.health?.ok === true ? 'ok' : 'bad'}` }),
        healthLine(app),
      ]),
      app.missingSecrets.length === 0
        ? null
        : h('div', {
            className: 'note warn',
            text: `Needs the key ${app.missingSecrets.join(', ')}. Open Edit and paste it.`,
          }),
      h(
        'div',
        { className: 'chips' },
        (app.tools.length > 0 ? app.tools : ['no tools']).map((tool) => h('span', { className: 'chip', text: tool })),
      ),
    ]);

    const toggle = h('button', {
      className: 'small',
      text: app.enabled ? 'Disable' : 'Enable',
      attrs: { type: 'button' },
    });
    toggle.addEventListener('click', () => void whileBusy(toggle, '...', () => actions.toggle(app)));

    const remove = h('button', { className: 'small danger', text: 'Remove', attrs: { type: 'button' } });
    remove.addEventListener('click', () => void whileBusy(remove, '...', () => actions.remove(app)));

    const edit = h('button', {
      className: 'small',
      text: 'Edit',
      attrs: { type: 'button' },
      on: { click: () => actions.edit(app) },
    });

    this.element = h('div', { className: 'card item', dataset: { app: app.id } }, [
      main,
      h('div', { className: 'actions' }, [edit, toggle, remove]),
    ]);
  }
}

/** Health in a few words: disabled, the error, or how much it holds and how fresh it is. */
export function healthLine(app: AppWire): string {
  if (!app.enabled) return 'Disabled';
  if (app.health === null) return 'Not checked yet';
  const source = app.health.sources[0];
  if (!app.health.ok) return source?.lastError ?? 'Not healthy';

  const parts: string[] = [];
  if (source?.itemCount !== null && source?.itemCount !== undefined)
    parts.push(`${source.itemCount.toLocaleString()} records`);
  if (source?.lastDataDate) parts.push(`fresh to ${source.lastDataDate.slice(0, 10)}`);
  return parts.join(' · ') || 'Healthy';
}
