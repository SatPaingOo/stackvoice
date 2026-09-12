/**
 * Styles shared by the console pages: lists, cards, field maps and step rows.
 * Component styles live in web/components-css.ts.
 */
export const CONSOLE_CSS = `
  .empty { text-align: center; padding: 46px 24px; }
  .empty h3 { font-size: 17px; }
  .empty p { margin: 8px auto 18px; max-width: 46ch; font-size: 15px; }

  .list { display: grid; gap: 14px; }
  .item { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
  .item .main { flex: 1; min-width: 260px; }
  .item h3 { font-size: 17px; margin: 0 0 3px; }
  .item .meta { color: var(--muted); font-size: 13.5px; margin: 0 0 10px; font-family: var(--mono); }
  .item .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
  .item .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .health { display: flex; align-items: center; gap: 7px; font-size: 14px; color: var(--ink-soft); }

  .panel { border-color: var(--accent); box-shadow: var(--shadow-lg); }
  .panel h2 { font-size: 19px; }
  .panel > p.soft { margin: 6px 0 4px; font-size: 14.5px; }

  .map { display: grid; grid-template-columns: 118px minmax(0, 1fr) minmax(0, 1.1fr); gap: 9px 14px;
         align-items: center; margin-top: 8px; }
  .map .head { font-size: 11.5px; font-weight: 600; color: var(--muted);
               text-transform: uppercase; letter-spacing: .05em; }
  .map .name { font-size: 14px; color: var(--ink-soft); }
  .map input { padding: 8px 11px; font: 13.5px var(--mono); }
  .map .sample { font: 12.5px var(--mono); color: var(--muted);
                 overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .stat { font: 13.5px var(--mono); color: var(--ink-soft); }

  @media (max-width: 720px) {
    .map { grid-template-columns: 1fr; gap: 4px; }
    .map .head, .map .sample { display: none; }
    .map .name { margin-top: 8px; font-size: 13px; }
    .two { grid-template-columns: 1fr; }
  }
`;
