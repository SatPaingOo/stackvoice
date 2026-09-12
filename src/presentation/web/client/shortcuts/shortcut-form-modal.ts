import type { ConfirmDialog } from '../components/confirm-dialog.js';
import { TextAreaField, TextField } from '../components/form-controls.js';
import { Modal } from '../components/modal.js';
import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import { toolNameFor } from './shortcut-hints.js';
import type { ShortcutInput, ShortcutWire, ToolWire } from './shortcut-types.js';
import type { ShortcutsGateway } from './shortcuts-api.js';
import { StepList } from './step-list.js';

export interface ShortcutFormDeps {
  readonly shortcuts: ShortcutsGateway;
  readonly confirm: ConfirmDialog;
  /** The most steps the server accepts. */
  readonly maxSteps: number;
}

/** Adds or edits one shortcut, in a dialog. */
export class ShortcutFormModal {
  private readonly modal: Modal;
  private readonly notice = new Notice();
  private readonly name = new TextField({ label: 'Name', hint: 'say it the way you would out loud', placeholder: 'morning brief', id: 'name' });
  private readonly toolName = h('p', { className: 'hint-line', attrs: { id: 'toolName' } });
  private readonly reply = new TextField({ label: 'How to answer', hint: '{1}, {2} or {results}', placeholder: 'Here is your brief. {results}', id: 'reply' });
  private readonly description = new TextAreaField({
    label: 'What it does',
    hint: 'your assistant reads this to decide when to run it',
    id: 'description',
  });
  private readonly steps: StepList;
  private readonly saveButton = h('button', { className: 'primary', text: 'Save shortcut', attrs: { type: 'button', id: 'save' } });
  private readonly cancelButton = h('button', { className: 'ghost', text: 'Cancel', attrs: { type: 'button', id: 'cancel' } });
  private readonly savedListeners: (() => void)[] = [];
  private editing: ShortcutWire | null = null;
  private dirty = false;

  constructor(private readonly deps: ShortcutFormDeps) {
    this.steps = new StepList(deps.maxSteps);
    this.modal = new Modal({ title: 'Add a shortcut', canDismiss: () => this.canDismiss() });
    this.modal.element.id = 'shortcutModal';
    this.notice.element.id = 'shortcutNote';

    this.modal.body.append(
      this.notice.element,
      h('div', { className: 'two' }, [h('div', {}, [this.name.element, this.toolName]), this.reply.element]),
      this.description.element,
      this.steps.element,
    );
    this.modal.footer.append(h('span', { className: 'spacer' }), this.cancelButton, this.saveButton);

    this.modal.body.addEventListener('input', () => {
      this.dirty = true;
    });
    this.name.onInput(() => this.showToolName());
    this.saveButton.addEventListener('click', () => void this.save());
    this.cancelButton.addEventListener('click', () => void this.modal.dismiss());
  }

  onSaved(listener: () => void): void {
    this.savedListeners.push(listener);
  }

  setTools(tools: readonly ToolWire[]): void {
    this.steps.setTools(tools);
  }

  openNew(): void {
    this.fill(null);
    this.modal.setTitle('Add a shortcut', 'Steps run in order, so the answer is the same every time.');
    this.modal.open();
    this.name.focus();
  }

  openEdit(shortcut: ShortcutWire): void {
    this.fill(shortcut);
    this.modal.setTitle(`Edit ${shortcut.name}`, 'Saving takes effect immediately.');
    this.modal.open();
  }

  private fill(shortcut: ShortcutWire | null): void {
    this.editing = shortcut;
    this.notice.clear();
    this.name.value = shortcut?.name ?? '';
    this.reply.value = shortcut?.reply ?? '';
    this.description.value = shortcut?.description ?? '';
    this.steps.value = shortcut?.steps ?? [];
    this.showToolName();
    this.dirty = false;
  }

  private async save(): Promise<void> {
    const steps = this.steps.read();
    if (!steps.ok) {
      this.notice.show('err', steps.problem);
      return;
    }

    const shortcut: ShortcutInput = {
      name: this.name.value,
      description: this.description.value,
      reply: this.reply.value,
      enabled: this.editing?.enabled ?? true,
      steps: steps.steps,
    };

    await whileBusy(this.saveButton, 'Saving...', async () => {
      try {
        if (this.editing === null) await this.deps.shortcuts.create(shortcut);
        else await this.deps.shortcuts.update(this.editing.name, shortcut);
        this.dirty = false;
        this.modal.close();
        for (const listener of this.savedListeners) listener();
      } catch (error) {
        this.notice.show('err', messageOf(error));
        this.modal.body.scrollTop = 0;
      }
    });
  }

  private showToolName(): void {
    const tool = toolNameFor(this.name.value);
    this.toolName.textContent = tool === '' ? '' : `Becomes the tool ${tool}`;
  }

  private async canDismiss(): Promise<boolean> {
    if (!this.dirty) return true;
    return this.deps.confirm.ask({
      title: 'Discard your changes?',
      message: 'Nothing in this shortcut has been saved yet.',
      confirmLabel: 'Discard',
      danger: true,
    });
  }
}
