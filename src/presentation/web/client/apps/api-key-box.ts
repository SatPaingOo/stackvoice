import { TextField } from '../components/form-controls.js';
import { h, uniqueId } from '../core/dom.js';
import type { UrlLocationWire } from './app-types.js';
import { keyHeaderValue, SECRET_NAME, secretNameFor } from './source-hints.js';

export interface PendingKey {
  readonly name: string;
  readonly value: string;
}

/**
 * The "this needs an API key" section of the app form.
 *
 * It knows how a header that references a saved key is written, and whether the
 * person changed it. It never stores a key: the form hands `pendingKey()` to the
 * secrets gateway, so this stays a view with no network behind it.
 */
export class ApiKeyBox {
  readonly element: HTMLDetailsElement;
  private readonly header = new TextField({ label: 'Header', mono: true, id: 'hName' });
  private readonly prefix = new TextField({ label: 'Before the key', hint: 'often Bearer', mono: true, id: 'hPrefix' });
  private readonly name = new TextField({ label: 'Saved as', placeholder: 'MY_API_KEY', mono: true, id: 'secretName' });
  private readonly key = new TextField({ label: 'Key', type: 'password', placeholder: 'paste the key', id: 'secretValue' });
  private readonly state = h('p', { className: 'hint-line' });
  private readonly info = h('p', { className: 'soft' });
  private readonly names = h('datalist', { attrs: { id: uniqueId('secret-names') } });
  private readonly dropRow: HTMLDivElement;
  private known: readonly string[] = [];
  private touched = false;
  private dropped = false;
  private nameTouched = false;

  constructor() {
    this.name.control.setAttribute('list', this.names.id);
    for (const field of [this.header, this.prefix, this.name, this.key]) {
      field.onInput(() => {
        this.touched = true;
        this.dropped = false;
        this.showState();
      });
    }
    this.name.onInput(() => {
      this.nameTouched = true;
    });

    this.dropRow = h('div', { className: 'row' }, [
      h('button', {
        className: 'small ghost',
        text: 'Stop sending a key',
        attrs: { type: 'button', id: 'dropKey' },
        on: { click: () => this.drop() },
      }),
    ]);

    this.element = h('details', { className: 'keybox', attrs: { id: 'keybox' } }, [
      h('summary', { text: 'This needs an API key' }),
      h('p', { className: 'soft' }, [
        'Kept on this server in ',
        h('code', { text: 'config/secrets.yml' }),
        '. It is never written into the app file and never shown again, not even here.',
      ]),
      this.info,
      h('div', { className: 'three' }, [this.header.element, this.prefix.element, this.name.element]),
      this.key.element,
      this.state,
      this.names,
      this.dropRow,
    ]);
    this.info.hidden = true;
  }

  set visible(visible: boolean) {
    this.element.hidden = !visible;
  }

  /** The keys already saved, offered as names and used to tell whether a key must be pasted. */
  setKnown(names: readonly string[]): void {
    this.known = names;
    this.names.replaceChildren(...names.map((name) => h('option', { attrs: { value: name } })));
    this.showState();
  }

  /** Proposes a name from the address, until the person types one of their own. */
  suggestFor(link: string): void {
    if (!this.nameTouched) this.name.value = secretNameFor(link);
    this.showState();
  }

  /** Starts over for a new app, or from what an existing one sends. */
  reset(location: UrlLocationWire | null): void {
    this.touched = false;
    this.dropped = false;
    this.key.value = '';
    const header = location?.headers[0];

    if (header !== undefined && header.secret !== null) {
      this.header.value = header.name;
      this.prefix.value = header.prefix ?? '';
      this.name.value = header.secret;
      this.nameTouched = true;
      this.element.open = true;
    } else {
      this.header.value = 'Authorization';
      this.prefix.value = 'Bearer';
      this.name.value = '';
      this.nameTouched = false;
      this.element.open = false;
    }

    // A header written into the app file by hand keeps its value unless a key is saved here instead.
    this.info.hidden = header === undefined || header.secret !== null;
    this.info.textContent = header === undefined ? '' : `This app sends a ${header.name} header set in its app file. Saving a key here replaces it.`;
    this.dropRow.hidden = header === undefined || header.secret === null;
    this.showState();
  }

  /** Whether a key should be sent at all. */
  get wanted(): boolean {
    return !this.element.hidden && this.element.open && !this.dropped;
  }

  get changed(): boolean {
    return this.touched;
  }

  get droppedKey(): boolean {
    return this.dropped;
  }

  /** What is wrong with the key section, in words a person can act on, or null. */
  problem(): string | null {
    const name = this.name.value.trim();
    if (this.header.value.trim() === '') return 'Say which header carries the key. Most APIs use Authorization.';
    if (!SECRET_NAME.test(name)) return 'Save the key under a name in capital letters, digits and underscores, such as MY_API_KEY.';
    if (this.key.value.trim() === '' && !this.known.includes(name)) return 'Paste the key, or pick a name that is already saved.';
    return null;
  }

  /** The header to save with the app. It references the key by name. */
  headers(): Record<string, string> {
    return { [this.header.value.trim()]: keyHeaderValue(this.prefix.value, this.name.value) };
  }

  /** A key pasted and not yet stored. */
  pendingKey(): PendingKey | null {
    const value = this.key.value.trim();
    return this.wanted && value !== '' ? { name: this.name.value.trim(), value } : null;
  }

  /** The key is on the server now: forget the pasted value. */
  keyStored(name: string): void {
    this.key.value = '';
    if (!this.known.includes(name)) this.setKnown([...this.known, name]);
  }

  private drop(): void {
    this.dropped = true;
    this.touched = true;
    this.element.open = false;
  }

  private showState(): void {
    const name = this.name.value.trim();
    this.state.textContent = name !== '' && this.known.includes(name) ? `A key is saved as ${name}. Leave the key empty to keep it.` : '';
  }
}
