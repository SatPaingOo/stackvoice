import { ConfirmDialog } from '../components/confirm-dialog.js';
import { emptyState } from '../components/empty-state.js';
import { Notice } from '../components/notice.js';
import { ApiClient, messageOf } from '../core/api-client.js';
import { byId } from '../core/dom.js';
import { ShortcutCard, type ShortcutCardActions } from './shortcut-card.js';
import { ShortcutFormModal } from './shortcut-form-modal.js';
import type { ShortcutWire } from './shortcut-types.js';
import { ShortcutsApi, type ShortcutsGateway } from './shortcuts-api.js';

/** The list of shortcuts, and what each card's buttons do. */
class ShortcutsScreen implements ShortcutCardActions {
  private readonly notice = new Notice();

  constructor(
    private readonly list: HTMLElement,
    private readonly shortcuts: ShortcutsGateway,
    private readonly form: ShortcutFormModal,
    private readonly confirm: ConfirmDialog,
  ) {
    byId('listNote').append(this.notice.element);
    byId<HTMLButtonElement>('new').addEventListener('click', () => this.form.openNew());
    this.form.onSaved(() => void this.load());
  }

  async load(): Promise<void> {
    try {
      const [tools, shortcuts] = await Promise.all([this.shortcuts.tools(), this.shortcuts.list()]);
      this.form.setTools(tools);
      this.notice.clear();
      this.list.replaceChildren(
        ...(shortcuts.length === 0
          ? [emptyState('No shortcuts yet', 'Add one to answer several questions with a single phrase.')]
          : shortcuts.map((shortcut) => new ShortcutCard(shortcut, this).element)),
      );
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }

  edit(shortcut: ShortcutWire): void {
    this.form.openEdit(shortcut);
  }

  async remove(shortcut: ShortcutWire): Promise<void> {
    const sure = await this.confirm.ask({
      title: `Remove ${shortcut.name}?`,
      message: `Your assistant loses the ${shortcut.toolName} tool. A backup is kept in config/backups.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!sure) return;
    try {
      await this.shortcuts.remove(shortcut.name);
      await this.load();
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }
}

// Composition root for this page.
const list = byId<HTMLDivElement>('shortcuts');
const maxSteps = Number(list.dataset['maxSteps']);
if (!Number.isInteger(maxSteps) || maxSteps < 1) {
  throw new Error('the page did not say how many steps a shortcut may have');
}

const shortcuts = new ShortcutsApi(new ApiClient());
const confirm = new ConfirmDialog();
const form = new ShortcutFormModal({ shortcuts, confirm, maxSteps });

void new ShortcutsScreen(list, shortcuts, form, confirm).load();
