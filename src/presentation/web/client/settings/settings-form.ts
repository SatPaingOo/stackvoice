import { Notice } from '../components/notice.js';
import { messageOf } from '../core/api-client.js';
import { whileBusy } from '../core/busy.js';
import { byId } from '../core/dom.js';
import type { AuthMode, LogLevel, SettingsGateway, SettingsView } from './settings-api.js';

/**
 * The settings form the server renders. This binds to its fields rather than
 * building them, because settings are one fixed page, not something added or
 * edited in a dialog.
 */
export class SettingsForm {
  private readonly form = byId<HTMLFormElement>('form');
  private readonly saveButton = byId<HTMLButtonElement>('save');
  private readonly notice = new Notice();
  private readonly input = {
    token: byId<HTMLInputElement>('token'),
    tokenState: byId<HTMLSpanElement>('tokenState'),
    publicUrl: byId<HTMLInputElement>('publicUrl'),
    privateNet: byId<HTMLInputElement>('privateNet'),
    dataDir: byId<HTMLInputElement>('dataDir'),
    console: byId<HTMLInputElement>('console'),
    simulator: byId<HTMLInputElement>('simulator'),
    host: byId<HTMLInputElement>('host'),
    port: byId<HTMLInputElement>('port'),
    ttl: byId<HTMLInputElement>('ttl'),
    logLevel: byId<HTMLSelectElement>('logLevel'),
    mcpUrl: byId<HTMLElement>('mcpUrl'),
    copy: byId<HTMLButtonElement>('copy'),
  };

  constructor(private readonly settings: SettingsGateway) {
    byId('formNote').append(this.notice.element);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.save();
    });
    this.input.copy.addEventListener('click', () => void this.copyAddress());
  }

  async load(): Promise<void> {
    try {
      this.fill(await this.settings.load());
    } catch (error) {
      this.notice.show('err', messageOf(error));
    }
  }

  private fill(view: SettingsView): void {
    const { settings } = view;
    this.input.mcpUrl.textContent = view.endpoints.mcp;
    for (const radio of this.form.querySelectorAll<HTMLInputElement>('input[name=mode]')) {
      radio.checked = radio.value === settings.auth.mode;
    }
    this.input.tokenState.textContent = settings.auth.tokenSet ? '— one is set' : '— none set';
    this.input.token.value = '';
    this.input.publicUrl.value = settings.auth.publicUrl;
    this.input.privateNet.checked = settings.sources.allowPrivateNetwork;
    this.input.dataDir.value = settings.sources.dataDir;
    this.input.console.checked = settings.console.enabled;
    this.input.simulator.checked = settings.simulator.enabled;
    this.input.host.value = settings.server.host;
    this.input.port.value = String(settings.server.port);
    this.input.ttl.value = String(settings.cache.ttlSeconds);
    this.input.logLevel.value = settings.server.logLevel;
  }

  private async save(): Promise<void> {
    const mode = this.form.querySelector<HTMLInputElement>('input[name=mode]:checked');
    await whileBusy(this.saveButton, 'Saving...', async () => {
      try {
        const saved = await this.settings.save({
          server: {
            host: this.input.host.value.trim(),
            port: Number(this.input.port.value),
            logLevel: this.input.logLevel.value as LogLevel,
          },
          auth: {
            mode: (mode?.value ?? 'none') as AuthMode,
            token: this.input.token.value,
            publicUrl: this.input.publicUrl.value.trim(),
          },
          console: { enabled: this.input.console.checked },
          simulator: { enabled: this.input.simulator.checked },
          cache: { ttlSeconds: Number(this.input.ttl.value) },
          sources: { allowPrivateNetwork: this.input.privateNet.checked, dataDir: this.input.dataDir.value.trim() },
        });
        this.fill(saved);
        if (saved.restartRequired)
          this.notice.show('warn', 'Saved. Restart the server for these changes to take effect.');
        else this.notice.show('ok', 'Saved.');
      } catch (error) {
        this.notice.show('err', messageOf(error));
      }
    });
  }

  private async copyAddress(): Promise<void> {
    const text = this.input.mcpUrl.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.input.copy.textContent = 'Copied';
    } catch {
      // Clipboard access needs a secure context; the address stays on screen to copy by hand.
      this.input.copy.textContent = 'Select it';
    }
    window.setTimeout(() => {
      this.input.copy.textContent = 'Copy';
    }, 1400);
  }
}
