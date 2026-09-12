import { h, uniqueId } from '../core/dom.js';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalOptions {
  readonly title: string;
  readonly size?: ModalSize;
  /** Asked before closing on Escape, the close button or a click outside. False keeps it open. */
  readonly canDismiss?: () => boolean | Promise<boolean>;
  /** Runs however the dialog closed. */
  readonly onClose?: () => void;
}

/**
 * A dialog over the page.
 *
 * Built on the native `<dialog>` element, so focus stays inside it, Escape is
 * handled and the page behind cannot be clicked, without any code here to get
 * those wrong. What it adds is a consistent frame: a title, a scrolling body and
 * a footer for the actions, and one place to ask before unsaved work is thrown away.
 */
export class Modal {
  readonly element: HTMLDialogElement;
  readonly body: HTMLDivElement;
  readonly footer: HTMLDivElement;
  private readonly heading: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private pressedOnBackdrop = false;

  constructor(private readonly options: ModalOptions) {
    const titleId = uniqueId('modal-title');
    this.heading = h('h2', { className: 'modal-title', text: options.title, attrs: { id: titleId } });
    this.subtitle = h('p', { className: 'modal-subtitle' });
    this.body = h('div', { className: 'modal-body' });
    this.footer = h('div', { className: 'modal-footer' });

    const close = h('button', {
      className: 'modal-close ghost',
      text: '×',
      attrs: { type: 'button', 'aria-label': 'Close' },
      on: { click: () => void this.dismiss() },
    });

    this.element = h('dialog', { className: `modal ${options.size ?? 'md'}`, attrs: { 'aria-labelledby': titleId } }, [
      h('div', { className: 'modal-panel' }, [
        h('header', { className: 'modal-head' }, [h('div', { className: 'grow' }, [this.heading, this.subtitle]), close]),
        this.body,
        this.footer,
      ]),
    ]);

    // Escape raises `cancel`, and the dialog would close without asking.
    this.element.addEventListener('cancel', (event) => {
      event.preventDefault();
      void this.dismiss();
    });

    // The dialog element itself is only the target outside its panel, which is
    // the backdrop. Both press and release must land there, so selecting text
    // in a field and letting go outside does not throw the form away.
    this.element.addEventListener('mousedown', (event) => {
      this.pressedOnBackdrop = event.target === this.element;
    });
    this.element.addEventListener('click', (event) => {
      if (this.pressedOnBackdrop && event.target === this.element) void this.dismiss();
      this.pressedOnBackdrop = false;
    });

    this.element.addEventListener('close', () => this.options.onClose?.());
    document.body.append(this.element);
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  setTitle(title: string, subtitle = ''): void {
    this.heading.textContent = title;
    this.subtitle.textContent = subtitle;
    this.subtitle.hidden = subtitle === '';
  }

  open(): void {
    if (!this.element.open) this.element.showModal();
    this.body.scrollTop = 0;
  }

  close(): void {
    if (this.element.open) this.element.close();
  }

  /** Closes unless the owner says there is something worth keeping. */
  async dismiss(): Promise<void> {
    if (this.options.canDismiss !== undefined && !(await this.options.canDismiss())) return;
    this.close();
  }
}
