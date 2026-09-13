import { TextField } from '../components/form-controls.js';
import { h } from '../core/dom.js';
import { looksLikeRepo } from './source-hints.js';

interface Example {
  readonly label: string;
  readonly source: string;
  readonly tip: string;
}

const EXAMPLES: readonly Example[] = [
  {
    label: 'News feed',
    source: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    tip: 'Any RSS or Atom feed. Most news sites, blogs, podcasts and YouTube channels have one.',
  },
  {
    label: 'JSON API',
    source: 'https://api.github.com/repos/nodejs/node/releases',
    tip: 'Any address that answers with JSON. If it needs a key, open the key section below.',
  },
  {
    label: 'Spreadsheet',
    source: 'https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv',
    tip: 'A CSV link. For a Google Sheet: File, Share, Publish to web, choose CSV, and paste the link it gives you.',
  },
  {
    label: 'GitHub repo',
    source: 'SatPaingOo/information-hub',
    tip: 'A public GitHub repository that publishes JSON, as owner/name or its github.com link.',
  },
  {
    label: 'File',
    source: '',
    tip: 'Put a .json, .csv or .xml file in the data folder on this server, then type its name, such as prices.csv.',
  },
];

/**
 * The one box a source is pasted into, with a branch field that appears only for
 * a GitHub repository and examples of what else works.
 */
export class SourcePicker {
  readonly element: HTMLDivElement;
  private readonly source = new TextField({
    label: 'Where is the data?',
    placeholder: 'A feed or API link, owner/repo, or a file name',
    mono: true,
    id: 'source',
  });
  private readonly branch = new TextField({ label: 'Branch', placeholder: 'main', mono: true, id: 'branch' });
  private readonly tip = h('p', { className: 'tip' });
  private readonly chips: readonly HTMLButtonElement[];
  private readonly changeListeners: (() => void)[] = [];
  private readonly submitListeners: (() => void)[] = [];
  private lastValue = '';

  constructor() {
    this.branch.element.classList.add('branch');
    this.branch.element.hidden = true;

    this.chips = EXAMPLES.map((example) =>
      h('button', {
        className: 'kind',
        text: example.label,
        attrs: { type: 'button' },
        on: { click: () => this.use(example) },
      }),
    );

    this.element = h('div', { className: 'source-picker' }, [
      h('div', { className: 'source-row' }, [this.source.element, this.branch.element]),
      h('div', { className: 'kinds' }, [h('span', { className: 'muted', text: 'Try' }), ...this.chips]),
      this.tip,
    ]);

    this.source.onInput(() => this.changed());
    this.source.control.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      for (const listener of this.submitListeners) listener();
    });
  }

  get value(): string {
    return this.source.value.trim();
  }

  /** The branch, only when the source is a repository. */
  get branchValue(): string {
    return looksLikeRepo(this.value) ? this.branch.value.trim() : '';
  }

  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  /** Enter in the box: the same as asking to look at it. */
  onSubmit(listener: () => void): void {
    this.submitListeners.push(listener);
  }

  reset(): void {
    this.lastValue = '';
    this.source.value = '';
    this.branch.value = '';
    this.tip.textContent = '';
    this.branch.element.hidden = true;
    for (const chip of this.chips) chip.classList.remove('on');
  }

  focus(): void {
    this.source.focus();
  }

  private use(example: Example): void {
    this.chips.forEach((chip, index) => chip.classList.toggle('on', EXAMPLES[index] === example));
    this.tip.textContent = example.tip;
    this.source.value = example.source;
    this.changed();
    this.source.focus();
  }

  private changed(): void {
    this.branch.element.hidden = !looksLikeRepo(this.value);
    // `change` also fires when the box loses focus, which happens when Enter moves
    // the form on to what was found. Only a different source counts as a change.
    if (this.value === this.lastValue) return;
    this.lastValue = this.value;
    for (const listener of this.changeListeners) listener();
  }
}
