import type { ConfirmDialog } from '../components/confirm-dialog.js';
import { SwitchField, TextAreaField, TextField } from '../components/form-controls.js';
import { Modal } from '../components/modal.js';
import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import type { SecretsGateway } from '../secrets/secrets-api.js';
import { ApiKeyBox } from './api-key-box.js';
import type { AppInput, AppWire, LocationInput, LocationWire, ProposalWire } from './app-types.js';
import type { AppsGateway } from './apps-api.js';
import { FieldMapEditor } from './field-map-editor.js';
import { createLocationEditors, StatusFieldsEditor } from './location-editors.js';
import { capitalize, describeLocation, kindOf, looksLikeLink, nameFrom, toAppId } from './source-hints.js';
import { SourcePicker } from './source-picker.js';

export interface AppFormDeps {
  readonly apps: AppsGateway;
  readonly secrets: SecretsGateway;
  readonly confirm: ConfirmDialog;
}

type Step = 'source' | 'details';

/**
 * Adds or edits one app, in a dialog.
 *
 * Adding takes two steps: say where the data is, then check what was found.
 * Editing opens on the second. The form owns only the order of things, such as
 * storing a pasted key before looking at a link and keeping saved headers unless
 * the key changed. Each section it is built from owns its own fields.
 */
export class AppFormModal {
  private readonly modal: Modal;
  private readonly notice = new Notice();
  private readonly picker = new SourcePicker();
  private readonly keyBox = new ApiKeyBox();
  private readonly found = h('div', { className: 'found', attrs: { id: 'found' } });
  private readonly appId = new TextField({
    label: 'App id',
    hint: 'the tool prefix, like notes_search',
    mono: true,
    placeholder: 'notes',
    id: 'id',
  });
  private readonly label = new TextField({ label: 'Name', placeholder: 'My notes', id: 'label' });
  private readonly description = new TextAreaField({
    label: 'What is in it',
    hint: 'your assistant reads this to decide when to use it',
    id: 'description',
  });
  private readonly search = new SwitchField('search', 'pSearch');
  private readonly read = new SwitchField('read', 'pRead');
  private readonly status = new SwitchField('status', 'pStatus');
  private readonly fields = new FieldMapEditor();
  private readonly editors = createLocationEditors();
  private readonly editorSlot = h('div');
  private readonly itemsPath = new TextField({
    label: 'Records are under',
    hint: 'empty when the whole document is the list',
    placeholder: 'data.items',
    mono: true,
    id: 'itemsPath',
  });
  private readonly statusFields = new StatusFieldsEditor();
  private readonly statusBox = h('div', { className: 'field' }, [
    h('label', { text: 'Where the freshness and count live' }),
  ]);
  private readonly advanced = h('details', { className: 'advanced', attrs: { id: 'advanced' } }, [
    h('summary', { text: 'Where it is read from' }),
  ]);
  private readonly sourceStep: HTMLDivElement;
  private readonly detailsStep: HTMLDivElement;
  private readonly columnsButton = button('Show the columns in this data', 'small ghost', 'loadColumns');
  private readonly backButton = button('Back', 'ghost', 'back');
  private readonly cancelButton = button('Cancel', 'ghost', 'cancel');
  private readonly inspectButton = button('Look at it', 'primary', 'inspect');
  private readonly saveButton = button('Save app', 'primary', 'save');
  private readonly savedListeners: (() => void)[] = [];
  private editing: AppWire | null = null;
  private location: LocationWire | null = null;
  private existingIds: readonly string[] = [];
  private dirty = false;

  constructor(private readonly deps: AppFormDeps) {
    this.modal = new Modal({ title: 'Add an app', size: 'lg', canDismiss: () => this.canDismiss() });
    this.modal.element.id = 'appModal';
    this.notice.element.id = 'appNote';

    this.statusBox.append(this.statusFields.element);
    this.advanced.append(this.editorSlot, this.itemsPath.element, this.statusBox);

    this.sourceStep = h('div', {}, [this.picker.element]);
    this.detailsStep = h('div', {}, [
      this.found,
      h('div', { className: 'two' }, [this.appId.element, this.label.element]),
      this.description.element,
      h('div', { className: 'field' }, [
        h('label', { text: 'Tools to expose' }),
        h('div', { className: 'row switches' }, [this.search.element, this.read.element, this.status.element]),
      ]),
      this.fields.element,
      this.columnsButton,
      this.advanced,
    ]);

    this.modal.body.append(this.notice.element, this.sourceStep, this.keyBox.element, this.detailsStep);
    this.modal.footer.append(
      this.backButton,
      h('span', { className: 'spacer' }),
      this.cancelButton,
      this.inspectButton,
      this.saveButton,
    );

    // Any edit a person makes marks the form as worth asking about before it closes.
    this.modal.body.addEventListener('input', () => {
      this.dirty = true;
    });

    this.picker.onChange(() => this.sourceChanged());
    this.picker.onSubmit(() => void this.inspect());
    this.inspectButton.addEventListener('click', () => void this.inspect());
    this.saveButton.addEventListener('click', () => void this.save());
    this.columnsButton.addEventListener('click', () => void this.loadColumns());
    this.cancelButton.addEventListener('click', () => void this.modal.dismiss());
    this.backButton.addEventListener('click', () => this.showStep('source'));
  }

  /** Runs after every successful save, so the page can reload its list. */
  onSaved(listener: () => void): void {
    this.savedListeners.push(listener);
  }

  /** The ids in use, so adding one with a taken id asks before replacing it. */
  setExistingIds(ids: readonly string[]): void {
    this.existingIds = ids;
  }

  openNew(): void {
    this.editing = null;
    this.location = null;
    this.notice.clear();
    this.picker.reset();
    this.keyBox.reset(null);
    this.keyBox.visible = false;
    this.appId.disabled = false;
    this.modal.setTitle('Add an app', 'Nothing is written until you save.');
    this.showStep('source');
    this.dirty = false;
    this.modal.open();
    this.picker.focus();
    void this.refreshKnownKeys();
  }

  openEdit(app: AppWire): void {
    this.editing = app;
    this.location = app.location;
    this.notice.clear();
    this.keyBox.reset(app.location.type === 'url' ? app.location : null);
    this.keyBox.visible = app.location.type === 'url';

    this.appId.value = app.id;
    this.appId.disabled = true;
    this.label.value = app.label;
    this.description.value = app.description;
    this.setPrimitives(app.primitives);
    this.fields.value = app.fields;
    this.fields.showSamples(new Map());
    this.fields.showColumns([]);
    this.fillLocation(app.location, app.itemsPath);
    this.statusFields.value = app.statusFields;
    this.showFound(app.location, null);
    this.columnsButton.hidden = false;
    this.advanced.open = false;

    this.modal.setTitle(`Edit ${app.label}`, 'Saving takes effect immediately.');
    this.showStep('details');
    if (app.missingSecrets.length > 0) {
      this.notice.show(
        'warn',
        `The key ${app.missingSecrets.join(', ')} is not saved on this server. Paste it in the key section, then save.`,
      );
    }
    this.dirty = false;
    this.modal.open();
    void this.refreshKnownKeys();
  }

  private async inspect(): Promise<void> {
    const input = this.picker.value;
    if (input === '') {
      this.notice.show('err', 'Paste a link, a GitHub repository or a file name first.');
      return;
    }
    const withKey = looksLikeLink(input) && this.keyBox.wanted;
    const problem = withKey ? this.keyBox.problem() : null;
    if (problem !== null) {
      this.notice.show('err', problem);
      return;
    }

    this.notice.show('info', `Looking at ${input}...`);
    await whileBusy(this.inspectButton, 'Looking...', async () => {
      try {
        await this.storePendingKey();
        const proposal = await this.deps.apps.inspect({
          input,
          branch: this.picker.branchValue,
          headers: withKey ? this.keyBox.headers() : {},
        });
        this.showProposal(proposal, input);
        this.notice.show('ok', `Found ${proposal.itemCount.toLocaleString()} records. Check the guesses, then save.`);
      } catch (error) {
        this.notice.show('err', messageOf(error));
      }
    });
  }

  private showProposal(proposal: ProposalWire, input: string): void {
    const name = proposal.suggestedLabel ?? nameFrom(input);
    this.location = proposal.location;
    this.appId.value = toAppId(name);
    this.label.value = capitalize(name);
    this.description.value = `Records from ${describeLocation(proposal.location)}. Say in your own words what is in it: your assistant reads this to decide when to use the app.`;
    this.setPrimitives(proposal.suggestedPrimitives);
    this.fields.value = proposal.fields;
    this.fields.showSamples(new Map(proposal.evidence.map((row) => [row.field, row.sample])));
    this.fields.showColumns(proposal.availableKeys);
    this.fillLocation(proposal.location, proposal.itemsPath);
    this.statusFields.value = proposal.statusFields;
    this.showFound(proposal.location, proposal.itemCount);
    this.keyBox.visible = proposal.location.type === 'url';
    this.columnsButton.hidden = true;
    this.advanced.open = false;
    this.modal.setTitle('Add an app', 'Check what was found, then save.');
    this.showStep('details');
  }

  private async save(): Promise<void> {
    const id = this.appId.value.trim();
    if (this.location === null) {
      this.notice.show('err', 'Look at a source before saving.');
      return;
    }
    if (id === '') {
      this.notice.show('err', 'An app id is required.');
      return;
    }
    const sendsNewKey =
      this.location.type === 'url' && this.keyBox.wanted && (this.editing === null || this.keyBox.changed);
    const problem = sendsNewKey ? this.keyBox.problem() : null;
    if (problem !== null) {
      this.notice.show('err', problem);
      return;
    }
    if (this.editing === null && this.existingIds.includes(id)) {
      const replace = await this.deps.confirm.ask({
        title: `Replace ${id}?`,
        message: 'An app with this id already exists. Saving replaces it, and the old file is kept in config/backups.',
        confirmLabel: 'Replace it',
        danger: true,
      });
      if (!replace) return;
    }

    const app: AppInput = {
      label: this.label.value,
      description: this.description.value,
      enabled: this.editing?.enabled ?? true,
      primitives: { search: this.search.value, read: this.read.value, status: this.status.value },
      location: this.locationInput(this.location),
      itemsPath: this.itemsPath.value.trim() === '' ? null : this.itemsPath.value.trim(),
      fields: this.fields.value,
      statusFields: this.statusFields.value,
    };

    await whileBusy(this.saveButton, 'Saving...', async () => {
      try {
        await this.storePendingKey();
        await this.deps.apps.save(id, app);
        this.dirty = false;
        this.modal.close();
        for (const listener of this.savedListeners) listener();
      } catch (error) {
        this.notice.show('err', messageOf(error));
        this.modal.body.scrollTop = 0;
      }
    });
  }

  /** Looks at a saved app's source again, for its columns. Nothing it finds overwrites the fields. */
  private async loadColumns(): Promise<void> {
    if (this.location === null) return;
    const location = this.locationInput(this.location);
    const input =
      location.type === 'github-repo' ? location.repo : location.type === 'url' ? location.url : location.path;

    await whileBusy(this.columnsButton, 'Looking...', async () => {
      try {
        await this.storePendingKey();
        const proposal = await this.deps.apps.inspect({
          input,
          branch: location.type === 'github-repo' ? location.branch : '',
          headers: location.type === 'url' && this.keyBox.wanted ? this.keyBox.headers() : {},
        });
        this.fields.showColumns(proposal.availableKeys);
        if (this.location !== null) this.showFound(this.location, proposal.itemCount);
        this.columnsButton.hidden = true;
      } catch (error) {
        this.notice.show('err', messageOf(error));
      }
    });
  }

  /**
   * The location to send. Leaving a url source's headers out tells the server to
   * keep the ones it has, whose values this page never sees.
   */
  private locationInput(location: LocationWire): LocationInput {
    const editor = this.editors.get(location.type);
    const base = editor === undefined ? toInput(location) : editor.read();
    if (base.type !== 'url') return base;

    if (this.keyBox.droppedKey) return { ...base, headers: {} };
    if (this.keyBox.wanted && (this.editing === null || this.keyBox.changed))
      return { ...base, headers: this.keyBox.headers() };
    return this.editing === null ? { ...base, headers: {} } : base;
  }

  private async storePendingKey(): Promise<void> {
    const pending = this.keyBox.pendingKey();
    if (pending === null) return;
    await this.deps.secrets.save(pending.name, pending.value);
    this.keyBox.keyStored(pending.name);
  }

  private async refreshKnownKeys(): Promise<void> {
    try {
      this.keyBox.setKnown((await this.deps.secrets.list()).map((secret) => secret.name));
    } catch {
      // Only a convenience for picking a saved name; the form works without it.
    }
  }

  private sourceChanged(): void {
    const text = this.picker.value;
    this.keyBox.visible = looksLikeLink(text);
    if (looksLikeLink(text)) this.keyBox.suggestFor(text);
    // Whatever was found belonged to the old source.
    this.location = null;
    this.notice.clear();
  }

  private fillLocation(location: LocationWire, itemsPath: string | null): void {
    const editor = this.editors.get(location.type);
    if (editor !== undefined) {
      editor.load(location);
      this.editorSlot.replaceChildren(editor.element);
    }
    this.itemsPath.value = itemsPath ?? '';
    this.statusBox.hidden = location.type !== 'github-repo';
  }

  private showFound(location: LocationWire, count: number | null): void {
    this.found.replaceChildren(
      h('span', { className: 'kind-tag', text: kindOf(location) }),
      h('span', {
        text: `${count === null ? '' : `${count.toLocaleString()} records · `}${describeLocation(location)}`,
      }),
    );
  }

  private setPrimitives(primitives: AppInput['primitives']): void {
    this.search.value = primitives.search;
    this.read.value = primitives.read;
    this.status.value = primitives.status;
  }

  private showStep(step: Step): void {
    this.sourceStep.hidden = step !== 'source';
    this.detailsStep.hidden = step !== 'details';
    this.inspectButton.hidden = step !== 'source';
    this.saveButton.hidden = step !== 'details';
    this.backButton.hidden = step !== 'details' || this.editing !== null;
    // The key section follows the source it belongs to: under the box while pasting,
    // under the line that names the source once something was found.
    if (step === 'source') {
      this.sourceStep.append(this.keyBox.element);
      this.keyBox.visible = looksLikeLink(this.picker.value);
    } else {
      this.found.after(this.keyBox.element);
    }
    this.modal.body.scrollTop = 0;
  }

  private async canDismiss(): Promise<boolean> {
    if (!this.dirty) return true;
    return this.deps.confirm.ask({
      title: 'Discard your changes?',
      message: 'Nothing in this form has been saved yet.',
      confirmLabel: 'Discard',
      danger: true,
    });
  }
}

function button(text: string, className: string, id: string): HTMLButtonElement {
  return h('button', { className, text, attrs: { type: 'button', id } });
}

/** A saved location as it would be sent back unchanged. */
function toInput(location: LocationWire): LocationInput {
  switch (location.type) {
    case 'github-repo':
      return {
        type: location.type,
        repo: location.repo,
        branch: location.branch,
        indexFile: location.indexFile,
        statsFile: location.statsFile,
      };
    case 'url':
      return { type: location.type, url: location.url, format: location.format };
    case 'file':
      return { type: location.type, path: location.path, format: location.format };
  }
}
