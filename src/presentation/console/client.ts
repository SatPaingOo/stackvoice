/**
 * The JavaScript every console page shares: fetch, notices, and small DOM
 * helpers. Inlined per page rather than served as a file, so the console keeps
 * working from a clone with no build step and no network.
 */
export const CONSOLE_CLIENT = `
function el(id) { return document.getElementById(id); }

function make(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function note(target, kind, text) {
  var box = typeof target === 'string' ? el(target) : target;
  if (!box) return;
  box.innerHTML = '';
  if (!text) return;
  box.appendChild(make('div', 'note ' + kind, text));
}

function api(method, path, body) {
  return fetch(path, {
    method: method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  }).then(function (response) {
    if (response.status === 401) {
      window.location.href = '/console/signin?next=' + encodeURIComponent(window.location.pathname);
      throw new Error('Sign in first.');
    }
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok) throw new Error(data.error || 'That did not work.');
      return data;
    });
  });
}

function busy(button, on, label) {
  if (!button) return;
  button.disabled = on;
  if (on) {
    button.dataset.label = button.textContent;
    button.textContent = label || 'Working...';
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}
`;

/** An empty-state card, used wherever a list can be legitimately empty. */
export function emptyState(title: string, body: string, action?: { href: string; label: string }): string {
  return `<div class="card empty">
  <h3>${title}</h3>
  <p class="soft">${body}</p>
  ${action === undefined ? '' : `<a class="btn primary" href="${action.href}">${action.label}</a>`}
</div>`;
}

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

  .step { display: flex; gap: 9px; align-items: center; margin-top: 9px; }
  .step .num { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--bg-alt);
               color: var(--muted); font-size: 12px; font-weight: 600;
               display: inline-flex; align-items: center; justify-content: center; }
  .step select { flex: 1.2; min-width: 0; }
  .step input { flex: 1; min-width: 0; font: 13.5px var(--mono); }
  .step .drop { flex: none; padding: 9px 12px; }

  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .stat { font: 13.5px var(--mono); color: var(--ink-soft); }

  @media (max-width: 720px) {
    .map { grid-template-columns: 1fr; gap: 4px; }
    .map .head, .map .sample { display: none; }
    .map .name { margin-top: 8px; font-size: 13px; }
    .two { grid-template-columns: 1fr; }
    .step { flex-wrap: wrap; }
    .step select, .step input { flex-basis: 100%; }
  }
`;
