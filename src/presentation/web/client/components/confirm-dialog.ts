import { h } from '../core/dom.js';
import { Modal } from './modal.js';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  /** A destructive action: styled as one, and Cancel gets the focus. */
  readonly danger?: boolean;
}

/** Asks one yes-or-no question in the console's own dialog rather than the browser's. */
export class ConfirmDialog {
  private readonly modal: Modal;
  private readonly message = h('p', { className: 'confirm-message' });
  private readonly cancelButton: HTMLButtonElement;
  private readonly confirmButton: HTMLButtonElement;
  private pending: ((answer: boolean) => void) | null = null;

  constructor() {
    this.modal = new Modal({ title: '', size: 'sm', onClose: () => this.settle(false) });
    this.cancelButton = h('button', {
      className: 'ghost',
      text: 'Cancel',
      attrs: { type: 'button' },
      on: { click: () => this.settle(false) },
    });
    this.confirmButton = h('button', { attrs: { type: 'button' }, on: { click: () => this.settle(true) } });
    this.modal.element.classList.add('confirm');
    this.modal.body.append(this.message);
    this.modal.footer.append(this.cancelButton, this.confirmButton);
  }

  ask(request: ConfirmRequest): Promise<boolean> {
    // A question left unanswered counts as no before the next one is asked.
    this.settle(false);
    this.modal.setTitle(request.title);
    this.message.textContent = request.message;
    this.confirmButton.textContent = request.confirmLabel;
    this.confirmButton.className = request.danger === true ? 'danger-solid' : 'primary';

    return new Promise<boolean>((resolve) => {
      this.pending = resolve;
      this.modal.open();
      (request.danger === true ? this.cancelButton : this.confirmButton).focus();
    });
  }

  private settle(answer: boolean): void {
    const resolve = this.pending;
    this.pending = null;
    this.modal.close();
    resolve?.(answer);
  }
}
