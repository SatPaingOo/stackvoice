import type { ConfirmDialog } from '../components/confirm-dialog.js';
import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { byId, h } from '../core/dom.js';
import type { KeyFormModal } from './key-form-modal.js';
import type { SecretSummary, SecretsGateway } from './secrets-api.js';

/** The saved keys, by name only, with the apps that use each. */
export class SavedKeysPanel {
  private readonly list = byId<HTMLDivElement>('keys');
  private readonly notice = new Notice();

  constructor(
    private readonly secrets: SecretsGateway,
    private readonly form: KeyFormModal,
    private readonly confirm: ConfirmDialog,
  ) {
    byId('keysNote').append(this.notice.element);
    byId<HTMLButtonElement>('addKey').addEventListener('click', () => this.form.open());
    this.form.onSaved((name) => {
      this.notice.show('ok', `Saved ${name}.`);
      void this.load();
    });
  }

  async load(): Promise<void> {
    try {
      const secrets = await this.secrets.list();
      this.list.replaceChildren(
        ...(secrets.length === 0
          ? [h('p', { className: 'muted', text: 'No keys saved yet. The Apps page asks for one when a link needs it.' })]
          : secrets.map((secret) => this.row(secret))),
      );
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }

  private row(secret: SecretSummary): HTMLDivElement {
    const remove = h('button', { className: 'small danger', text: 'Remove', attrs: { type: 'button' } });
    remove.addEventListener('click', () => void whileBusy(remove, '...', () => this.remove(secret)));

    return h('div', { className: 'key-row', dataset: { key: secret.name } }, [
      h('code', { text: secret.name }),
      h('span', { className: 'used', text: secret.usedBy.length > 0 ? `used by ${secret.usedBy.join(', ')}` : 'not used by any app' }),
      remove,
    ]);
  }

  private async remove(secret: SecretSummary): Promise<void> {
    const sure = await this.confirm.ask({
      title: `Remove ${secret.name}?`,
      message:
        secret.usedBy.length > 0
          ? `${secret.usedBy.join(', ')} will stop working until a key is saved under this name again.`
          : 'No app uses it. The value cannot be recovered once removed.',
      confirmLabel: 'Remove key',
      danger: true,
    });
    if (!sure) return;
    try {
      await this.secrets.remove(secret.name);
      this.notice.clear();
      await this.load();
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }
}
