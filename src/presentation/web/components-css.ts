/**
 * Styles for the console's client components: the modal frame, form controls
 * and the pieces of the app and shortcut forms. Inlined into each console page
 * with the theme, so the components look the same wherever they are mounted.
 */
export const COMPONENTS_CSS = `
  [hidden] { display: none !important; }

  /* ---- modal ---- */
  dialog.modal { border: 0; padding: 0; background: transparent; color: var(--ink);
                 width: 660px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 48px); overflow: visible; }
  dialog.modal.sm { width: 440px; }
  dialog.modal.lg { width: 840px; }
  dialog.modal::backdrop { background: rgba(20, 18, 15, .5); backdrop-filter: blur(3px); }
  dialog.modal[open] { animation: modal-in .18s cubic-bezier(.2, .7, .3, 1); }
  @keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }

  .modal-panel { display: flex; flex-direction: column; max-height: calc(100dvh - 48px);
                 background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
                 box-shadow: var(--shadow-lg); overflow: hidden; }
  .modal-head { display: flex; gap: 12px; align-items: flex-start; padding: 18px 20px 14px;
                border-bottom: 1px solid var(--line-soft); }
  .modal-title { font-size: 19px; }
  .modal-subtitle { margin: 4px 0 0; font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
  button.modal-close { font-size: 22px; line-height: 1; padding: 3px 10px; margin: -4px -8px 0 0; }
  .modal-body { padding: 18px 20px 22px; overflow-y: auto; overscroll-behavior: contain; }
  .modal-footer { display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap;
                  padding: 13px 20px; border-top: 1px solid var(--line-soft); background: var(--bg-alt); }
  .modal-footer .spacer { flex: 1; }
  .modal-body > .notice:first-child .note { margin-top: 0; margin-bottom: 14px; }

  dialog.confirm .modal-head { border-bottom: 0; padding-bottom: 0; }
  .confirm-message { margin: 0; color: var(--ink-soft); }
  button.danger-solid { background: var(--bad); border-color: transparent; color: #fff; font-weight: 600; }
  button.danger-solid:hover { background: color-mix(in srgb, var(--bad) 82%, black); color: #fff; }

  /* A phone gets the whole screen for a form, and a card-sized box for a question. */
  @media (max-width: 640px) {
    dialog.modal:not(.sm) { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; }
    dialog.modal:not(.sm) .modal-panel { height: 100%; max-height: 100dvh; border: 0; border-radius: 0; }
    .modal-body { padding: 16px; }
    .modal-footer { padding: 12px 16px; }
    .modal-footer button { flex: 1; justify-content: center; }
    .modal-footer .spacer { display: none; }
  }

  /* ---- controls ---- */
  input.mono, textarea.mono, select.mono { font: 14px/1.5 var(--mono); }
  .hint-line { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
  .hint-line:empty { display: none; }
  .two > .field + .field, .three > .field + .field, .loc > .field + .field { margin-top: 0; }
  .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }

  /* ---- app form ---- */
  .source-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .source-row .field { flex: 1 1 320px; min-width: 0; margin: 0; }
  .source-row .field.branch { flex: 0 0 150px; }
  .kinds { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 12px; font-size: 13.5px; }
  button.kind { padding: 5px 12px; font-size: 13.5px; border-radius: 999px; }
  button.kind.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .tip { font-size: 13.5px; color: var(--muted); margin: 10px 0 0; }
  .tip:empty { display: none; }

  details.keybox, details.advanced { border: 1px solid var(--line-soft); border-radius: var(--radius-sm);
                                     background: var(--bg-alt); padding: 12px 14px; margin-top: 16px; }
  details > summary { cursor: pointer; font-size: 14.5px; font-weight: 600; color: var(--ink); }
  details[open] > summary { margin-bottom: 12px; }
  details .soft { font-size: 13.5px; margin: 0 0 12px; }
  details input[type=text], details input[type=password], details select { background: var(--panel); }
  details.keybox .row { margin-top: 12px; }

  .loc { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 12px; }
  .loc.github { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  details.advanced > .field { margin-top: 14px; }

  .found { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 0 0 16px;
           font-size: 14px; color: var(--ink-soft); overflow-wrap: anywhere; }
  .kind-tag { display: inline-block; font: 600 11.5px/1.6 var(--sans); letter-spacing: .04em; text-transform: uppercase;
              color: var(--accent-ink); background: var(--accent-soft); border-radius: 6px; padding: 1px 8px; white-space: nowrap; }
  .item .meta { overflow-wrap: anywhere; }
  .item .meta .kind-tag { margin-right: 9px; vertical-align: 1px; }
  .item .note { margin: 10px 0 0; }

  .columns { margin-top: 12px; }
  .columns p { font-size: 13px; margin: 0 0 8px; }
  .picks { display: flex; gap: 6px; flex-wrap: wrap; }
  .picks button { font: 12.5px/1.4 var(--mono); padding: 4px 9px; border-radius: 6px; }
  .map input.picked { border-color: var(--accent); }

  @media (max-width: 720px) {
    .three, .loc, .loc.github { grid-template-columns: 1fr; }
    .three > .field + .field, .loc > .field + .field { margin-top: 0; }
    .source-row .field.branch { flex: 1 1 100%; }
  }
`;
