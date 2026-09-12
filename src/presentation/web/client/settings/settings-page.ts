import { ConfirmDialog } from '../components/confirm-dialog.js';
import { ApiClient } from '../core/api-client.js';
import { KeyFormModal } from '../secrets/key-form-modal.js';
import { SavedKeysPanel } from '../secrets/saved-keys-panel.js';
import { SecretsApi } from '../secrets/secrets-api.js';
import { SettingsApi } from './settings-api.js';
import { SettingsForm } from './settings-form.js';

// Composition root for the settings page.
const http = new ApiClient();
const secrets = new SecretsApi(http);

void new SettingsForm(new SettingsApi(http)).load();
void new SavedKeysPanel(secrets, new KeyFormModal(secrets), new ConfirmDialog()).load();
