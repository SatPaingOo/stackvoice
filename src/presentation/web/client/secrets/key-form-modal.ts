import { TextField } from '../components/form-controls.js';
import { Modal } from '../components/modal.js';
import { Notice } from '../components/notice.js';
import { SECRET_NAME } from '../apps/source-hints.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { h } from '../core/dom.js';
import type { SecretsGateway } from './secrets-api.js';

/**
 * Saves one API key under a name, in a dialog. Saving under a name that exists
 * replaces its value, which is how a key is rotated.
 */
export class KeyFormModal {
  private readonly modal = new Modal({ title: 'Add a key', size: 'sm' });
  private readonly notice = new Notice();
  private readonly name = new TextField({
    label: 'Name',
    hint: 'capital letters, digits and _',
    placeholder: 'WEATHER_KEY',
    mono: true,
    id: 'newKeyName',
  });
  private readonly value = new TextField({
    label: 'Key',
    type: 'password',
    placeholder: 'paste the key',
    id: 'newKeyValue',
  });
  private readonly saveButton = h('button', {
    className: 'primary',
    text: 'Save key',
    attrs: { type: 'button', id: 'saveKey' },
  });
  private readonly savedListeners: ((name: string) => void)[] = [];

  constructor(private readonly secrets: SecretsGateway) {
    this.modal.element.id = 'keyModal';
    this.modal.body.append(this.notice.element, this.name.element, this.value.element);
    this.modal.footer.append(
      h('button', {
        className: 'ghost',
        text: 'Cancel',
        attrs: { type: 'button' },
        on: { click: () => this.modal.close() },
      }),
      this.saveButton,
    );
    this.saveButton.addEventListener('click', () => void this.save());
    this.value.control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.save();
    });
  }

  onSaved(listener: (name: string) => void): void {
    this.savedListeners.push(listener);
  }

  open(): void {
    this.name.value = '';
    this.value.value = '';
    this.notice.clear();
    this.modal.setTitle('Add a key', 'Kept on this server. It is never shown again once saved.');
    this.modal.open();
    this.name.focus();
  }

  private async save(): Promise<void> {
    const name = this.name.value.trim().toUpperCase();
    if (!SECRET_NAME.test(name)) {
      this.notice.show('err', 'Give the key a name in capital letters, digits and underscores, such as WEATHER_KEY.');
      return;
    }
    if (this.value.value.trim() === '') {
      this.notice.show('err', 'Paste the key to save.');
      return;
    }

    await whileBusy(this.saveButton, 'Saving...', async () => {
      try {
        await this.secrets.save(name, this.value.value);
        this.value.value = '';
        this.modal.close();
        for (const listener of this.savedListeners) listener(name);
      } catch (error) {
        this.notice.show('err', messageOf(error));
      }
    });
  }
}
