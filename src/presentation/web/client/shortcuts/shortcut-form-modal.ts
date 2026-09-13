import type { ConfirmDialog } from '../components/confirm-dialog.js';
import { TextAreaField, TextField } from '../components/form-controls.js';
import { Modal } from '../components/modal.js';
import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import { BlockListEditor } from './block-list-editor.js';
import type { FlowContext } from './flow-context.js';
import {
  answerNames,
  countAsks,
  countBlocks,
  describeProblem,
  insertableTokens,
  savedNames,
  starterBlock,
  toolNameFor,
} from './flow-hints.js';
import type { BlockWire, FlowLimits, ShortcutInput, ShortcutWire, ToolWire } from './shortcut-types.js';
import type { ShortcutsGateway } from './shortcuts-api.js';
import { TriggerListEditor } from './trigger-list-editor.js';
import { TryPanel } from './try-panel.js';

export interface ShortcutFormDeps {
  readonly shortcuts: ShortcutsGateway;
  readonly confirm: ConfirmDialog;
  readonly limits: FlowLimits;
}

/**
 * Builds or edits one shortcut in a dialog: its name, the ways to say it, and
 * its flow, block by block, with Try it to run the draft before it is saved.
 *
 * The form is the flow's context: it answers what the block editors ask, such
 * as which names exist, and it is the only piece that talks to the server.
 */
export class ShortcutFormModal {
  private readonly modal: Modal;
  private readonly notice = new Notice();
  private readonly name = new TextField({
    label: 'Name',
    hint: 'becomes the tool',
    placeholder: 'news about topic',
    id: 'name',
  });
  private readonly toolName = h('p', { className: 'hint-line', attrs: { id: 'toolName' } });
  private readonly description = new TextAreaField({
    label: 'What it does',
    hint: 'your assistant reads this to decide when to run it',
    id: 'description',
  });
  private readonly triggers: TriggerListEditor;
  private readonly flowSlot = h('div');
  private readonly counts = h('p', { className: 'flow-counts', attrs: { id: 'flowCounts' } });
  private readonly tryPanel: TryPanel;
  private readonly saveButton = h('button', {
    className: 'primary',
    text: 'Save shortcut',
    attrs: { type: 'button', id: 'save' },
  });
  private readonly cancelButton = h('button', {
    className: 'ghost',
    text: 'Cancel',
    attrs: { type: 'button', id: 'cancel' },
  });
  private readonly savedListeners: (() => void)[] = [];
  private readonly context: FlowContext;
  private tools: readonly ToolWire[] = [];
  private root: BlockListEditor | null = null;
  private editing: ShortcutWire | null = null;
  private dirty = false;

  constructor(private readonly deps: ShortcutFormDeps) {
    this.context = {
      limits: deps.limits,
      tools: () => this.tools,
      tokens: () => insertableTokens(this.triggers.slots(), this.blocks()),
      answers: () => answerNames(this.blocks()),
      values: () => [...this.triggers.slots(), ...savedNames(this.blocks())],
      createList: (depth, blocks) => new BlockListEditor(this.context, depth, blocks),
      starter: (kind) => starterBlock(kind, { tools: this.tools, slots: this.triggers.slots(), blocks: this.blocks() }),
      changed: () => this.flowChanged(),
    };
    this.triggers = new TriggerListEditor(deps.limits.maxTriggers, () => this.flowChanged());
    this.tryPanel = new TryPanel((inputs) => this.deps.shortcuts.tryRun(this.draft(), inputs));

    this.modal = new Modal({ title: 'Add a shortcut', size: 'lg', canDismiss: () => this.canDismiss() });
    this.modal.element.id = 'shortcutModal';
    this.notice.element.id = 'shortcutNote';

    this.modal.body.append(
      this.notice.element,
      h('div', { className: 'two' }, [h('div', {}, [this.name.element, this.toolName]), this.description.element]),
      this.triggers.element,
      h('div', { className: 'field' }, [
        h('label', {}, ['Blocks', h('span', { className: 'hint', text: ' — they run from top to bottom' })]),
        this.counts,
        this.flowSlot,
      ]),
      this.tryPanel.element,
    );
    this.modal.footer.append(h('span', { className: 'spacer' }), this.cancelButton, this.saveButton);

    // Typing a test value is not a change to the shortcut, so the Try it panel does not count.
    for (const type of ['input', 'change'] as const) {
      this.modal.body.addEventListener(type, (event) => {
        if (!this.tryPanel.element.contains(event.target as Node)) this.dirty = true;
      });
    }
    this.name.onInput(() => this.showToolName());
    this.saveButton.addEventListener('click', () => void this.save());
    this.cancelButton.addEventListener('click', () => void this.modal.dismiss());
  }

  onSaved(listener: () => void): void {
    this.savedListeners.push(listener);
  }

  setTools(tools: readonly ToolWire[]): void {
    this.tools = tools;
  }

  openNew(): void {
    this.fill(null);
    this.modal.setTitle('Add a shortcut', 'Blocks run from top to bottom. Try it before you save.');
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
    this.description.value = shortcut?.description ?? '';
    this.triggers.value = shortcut?.triggers ?? [];
    this.root = new BlockListEditor(this.context, 1, shortcut?.blocks ?? []);
    this.root.element.id = 'flow';
    this.flowSlot.replaceChildren(this.root.element);
    this.tryPanel.reset();
    this.showToolName();
    this.flowChanged();
    this.dirty = false;
  }

  private blocks(): BlockWire[] {
    return this.root?.read() ?? [];
  }

  private draft(): ShortcutInput {
    return {
      name: this.name.value,
      description: this.description.value,
      enabled: this.editing?.enabled ?? true,
      triggers: this.triggers.value,
      blocks: this.blocks(),
    };
  }

  private flowChanged(): void {
    const blocks = this.blocks();
    const total = countBlocks(blocks);
    const asks = countAsks(blocks);
    const { maxBlocks, maxAsks } = this.deps.limits;
    this.counts.textContent = `${total} of ${maxBlocks} blocks · ${asks} of ${maxAsks} tool calls`;
    this.counts.classList.toggle('over', total > maxBlocks || asks > maxAsks);
    this.tryPanel.setSlots(this.triggers.slots());
    this.dirty = true;
  }

  private async save(): Promise<void> {
    const draft = this.draft();
    await whileBusy(this.saveButton, 'Saving...', async () => {
      try {
        if (this.editing === null) await this.deps.shortcuts.create(draft);
        else await this.deps.shortcuts.update(this.editing.name, draft);
        this.dirty = false;
        this.modal.close();
        for (const listener of this.savedListeners) listener();
      } catch (error) {
        this.notice.show('err', describeProblem(messageOf(error)));
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
