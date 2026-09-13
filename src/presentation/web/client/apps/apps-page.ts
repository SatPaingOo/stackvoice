import { ConfirmDialog } from '../components/confirm-dialog.js';
import { emptyState } from '../components/empty-state.js';
import { Notice } from '../components/notice.js';
import { ApiClient, messageOf } from '../core/api-client.js';
import { byId } from '../core/dom.js';
import { SecretsApi } from '../secrets/secrets-api.js';
import { AppCard, type AppCardActions } from './app-card.js';
import { AppFormModal } from './app-form-modal.js';
import type { AppWire } from './app-types.js';
import { AppsApi, type AppsGateway } from './apps-api.js';

/** The list of apps, and what each card's buttons do. */
class AppsScreen implements AppCardActions {
  private readonly list = byId<HTMLDivElement>('apps');
  private readonly notice = new Notice();

  constructor(
    private readonly apps: AppsGateway,
    private readonly form: AppFormModal,
    private readonly confirm: ConfirmDialog,
  ) {
    byId('listNote').append(this.notice.element);
    byId<HTMLButtonElement>('new').addEventListener('click', () => this.form.openNew());
    this.form.onSaved(() => void this.load());
  }

  async load(): Promise<void> {
    try {
      const apps = await this.apps.list();
      this.notice.clear();
      this.form.setExistingIds(apps.map((app) => app.id));
      this.list.replaceChildren(
        ...(apps.length === 0
          ? [
              emptyState(
                'Nothing connected yet',
                'Add your first app and your assistant can start answering from your own data.',
              ),
            ]
          : apps.map((app) => new AppCard(app, this).element)),
      );
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }

  edit(app: AppWire): void {
    this.form.openEdit(app);
  }

  async toggle(app: AppWire): Promise<void> {
    try {
      await this.apps.setEnabled(app.id, !app.enabled);
      await this.load();
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }

  async remove(app: AppWire): Promise<void> {
    const sure = await this.confirm.ask({
      title: `Remove ${app.label}?`,
      message: 'Its tools disappear from your assistant. The app file is kept in config/backups.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!sure) return;
    try {
      await this.apps.remove(app.id);
      await this.load();
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }
}

// Composition root for this page: the only place its pieces are created and wired.
const http = new ApiClient();
const apps = new AppsApi(http);
const confirm = new ConfirmDialog();
const form = new AppFormModal({ apps, secrets: new SecretsApi(http), confirm });

void new AppsScreen(apps, form, confirm).load();
