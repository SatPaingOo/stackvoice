import { h } from '../core/dom.js';
import { SelectField, TextField, type Choice } from '../components/form-controls.js';
import type { LocationInput, LocationWire, SourceType, StatusFieldsWire } from './app-types.js';

const FORMAT_CHOICES: readonly Choice[] = [
  { value: 'json', label: 'JSON' },
  { value: 'rss', label: 'RSS feed' },
  { value: 'atom', label: 'Atom feed' },
  { value: 'csv', label: 'CSV' },
];

/**
 * Edits where one kind of source reads from.
 *
 * The form keeps one editor per source type and asks the one matching the app,
 * so a new source type is a new editor and one entry in `createLocationEditors`,
 * with the form itself untouched.
 */
export interface LocationEditor {
  readonly type: SourceType;
  readonly element: HTMLElement;
  load(location: LocationWire): void;
  read(): LocationInput;
}

class GithubLocationEditor implements LocationEditor {
  readonly type = 'github-repo';
  private readonly repo = new TextField({ label: 'Repository', mono: true });
  private readonly branch = new TextField({ label: 'Branch', mono: true });
  private readonly indexFile = new TextField({ label: 'Records file', mono: true });
  private readonly statsFile = new TextField({ label: 'Status file', mono: true });
  readonly element = h('div', { className: 'loc github' }, [
    this.repo.element,
    this.branch.element,
    this.indexFile.element,
    this.statsFile.element,
  ]);

  load(location: LocationWire): void {
    if (location.type !== this.type) return;
    this.repo.value = location.repo;
    this.branch.value = location.branch;
    this.indexFile.value = location.indexFile;
    this.statsFile.value = location.statsFile;
  }

  read(): LocationInput {
    return {
      type: this.type,
      repo: this.repo.value.trim(),
      branch: this.branch.value.trim(),
      indexFile: this.indexFile.value.trim(),
      statsFile: this.statsFile.value.trim(),
    };
  }
}

/** Headers are not edited here: the key box owns them, and the form combines the two. */
class UrlLocationEditor implements LocationEditor {
  readonly type = 'url';
  private readonly url = new TextField({ label: 'Address', mono: true, id: 'locationUrl' });
  private readonly format = new SelectField({ label: 'Format', choices: FORMAT_CHOICES });
  readonly element = h('div', { className: 'loc' }, [this.url.element, this.format.element]);

  load(location: LocationWire): void {
    if (location.type !== this.type) return;
    this.url.value = location.url;
    this.format.value = location.format;
  }

  read(): LocationInput {
    return { type: this.type, url: this.url.value.trim(), format: this.format.value as 'json' };
  }
}

class FileLocationEditor implements LocationEditor {
  readonly type = 'file';
  private readonly path = new TextField({ label: 'File', hint: 'inside the data folder', mono: true });
  private readonly format = new SelectField({ label: 'Format', choices: FORMAT_CHOICES });
  readonly element = h('div', { className: 'loc' }, [this.path.element, this.format.element]);

  load(location: LocationWire): void {
    if (location.type !== this.type) return;
    this.path.value = location.path;
    this.format.value = location.format;
  }

  read(): LocationInput {
    return { type: this.type, path: this.path.value.trim(), format: this.format.value as 'json' };
  }
}

export function createLocationEditors(): ReadonlyMap<SourceType, LocationEditor> {
  const editors: LocationEditor[] = [new GithubLocationEditor(), new UrlLocationEditor(), new FileLocationEditor()];
  return new Map(editors.map((editor) => [editor.type, editor]));
}

/** Where a GitHub source's status document keeps its freshness and count. Other sources count their records. */
export class StatusFieldsEditor {
  private readonly lastDataDate = new TextField({ label: 'Freshness is read from', mono: true });
  private readonly itemCount = new TextField({ label: 'Item count is read from', mono: true });
  readonly element = h('div', { className: 'two' }, [this.lastDataDate.element, this.itemCount.element]);

  get value(): StatusFieldsWire {
    return { lastDataDate: blankToNull(this.lastDataDate.value), itemCount: blankToNull(this.itemCount.value) };
  }

  set value(fields: StatusFieldsWire) {
    this.lastDataDate.value = fields.lastDataDate ?? '';
    this.itemCount.value = fields.itemCount ?? '';
  }
}

function blankToNull(text: string): string | null {
  return text.trim() === '' ? null : text.trim();
}
