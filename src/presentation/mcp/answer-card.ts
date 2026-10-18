/**
 * The answer card: an MCP Apps view (SEP-1865, spec 2026-01-26).
 *
 * A voice answer says two sentences; a device with a screen can show the
 * entries behind them. Hosts that support MCP Apps fetch this `ui://` resource
 * with `resources/read`, render it in a sandboxed iframe, and pass it each tool
 * result. Hosts that do not, ignore it and keep the spoken text, so nothing
 * depends on it.
 *
 * It needs no SDK: the view speaks plain JSON-RPC over `postMessage`, as the
 * spec allows. It loads nothing from the network, and it writes data into the
 * page only as text, never as HTML.
 */
export const ANSWER_CARD_URI = 'ui://stackvoice/answer-card';
export const ANSWER_CARD_MIME = 'text/html;profile=mcp-app';

/** Tool metadata that links a tool's results to the card. */
export const ANSWER_CARD_TOOL_META = { ui: { resourceUri: ANSWER_CARD_URI } } as const;

const STYLE = `
:root { color-scheme: light; --bg: #ffffff; --ink: #1a1a1a; --soft: #6b6b67; --line: #e8e6e1; --accent: #c96442; --chip: #f6efe9; }
:root[data-theme="dark"] { color-scheme: dark; --bg: #262625; --ink: #f0f0ef; --soft: #a6a5a0; --line: #3a3a38; --accent: #e7a184; --chip: #3a2f2a; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, "Segoe UI", sans-serif; }
main { padding: 14px 16px; }
h2 { margin: 0 0 2px; font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--accent); text-transform: uppercase; }
.sub { margin: 0 0 10px; color: var(--soft); font-size: 13px; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 9px 0; border-top: 1px solid var(--line); }
li:first-child { border-top: 0; padding-top: 2px; }
.title { font-weight: 600; }
.meta { color: var(--soft); font-size: 12.5px; margin-top: 1px; }
.summary { margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.full .summary { -webkit-line-clamp: 8; }
.chip { display: inline-block; background: var(--chip); color: var(--accent); border-radius: 999px; padding: 0 8px; font-size: 12px; margin-left: 6px; }
.row { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; }
.count { color: var(--accent); font-weight: 600; white-space: nowrap; }
`;

// Plain JavaScript, run inside the sandboxed iframe. No template literals, so it
// sits safely inside this TypeScript template string.
const SCRIPT = `
(function () {
  var nextId = 1;
  var waiting = {};
  var main = document.getElementById('card');

  function send(message) { window.parent.postMessage(message, '*'); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: '2.0', id: id, method: method, params: params });
    return new Promise(function (resolve, reject) { waiting[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send({ jsonrpc: '2.0', method: method, params: params || {} }); }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (message.id !== undefined && waiting[message.id]) {
      var pending = waiting[message.id];
      delete waiting[message.id];
      if (message.error) pending.reject(message.error); else pending.resolve(message.result);
      return;
    }
    if (message.method === 'ui/notifications/tool-result') render(message.params || {});
    if (message.method === 'ui/notifications/host-context-changed') applyContext(message.params || {});
  });

  function applyContext(context) {
    if (context && context.theme) document.documentElement.setAttribute('data-theme', context.theme);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function when(value) {
    if (!value) return '';
    var date = new Date(String(value).length === 10 ? value + 'T00:00:00Z' : value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function entry(item) {
    var li = el('li');
    li.appendChild(el('div', 'title', item.title));
    var meta = el('div', 'meta', when(item.date));
    if (item.topic) meta.appendChild(el('span', 'chip', item.topic));
    if (meta.textContent) li.appendChild(meta);
    if (item.summary && item.summary !== item.title) li.appendChild(el('div', 'summary', item.summary));
    return li;
  }

  function list(items, limit) {
    var ul = el('ul');
    items.slice(0, limit).forEach(function (item) { ul.appendChild(entry(item)); });
    return ul;
  }

  function textOf(result) {
    var parts = Array.isArray(result.content) ? result.content : [];
    for (var i = 0; i < parts.length; i++) if (parts[i] && parts[i].type === 'text') return parts[i].text;
    return '';
  }

  function entries(count, adjective) {
    return count + ' ' + (adjective ? adjective + ' ' : '') + (count === 1 ? 'entry' : 'entries');
  }

  function whatsNew(report) {
    var apps = Array.isArray(report.apps) ? report.apps : [];
    if (report.appId && apps.length === 1) {
      var only = apps[0];
      main.appendChild(el('h2', '', "What's new · " + only.label));
      if (only.kind === 'new') {
        main.appendChild(el('p', 'sub', (only.atLeast ? entries(only.items.length, '') + ' or more' : entries(only.items.length, 'new')) + ' since you last asked'));
        main.appendChild(list(only.items, 5));
      } else if (only.kind === 'first') {
        main.appendChild(el('p', 'sub', 'Now keeping track. The newest so far:'));
        main.appendChild(list([only.newest], 1));
      } else if (only.kind === 'none') {
        main.appendChild(el('p', 'sub', 'Nothing new since you last asked.'));
      } else {
        main.appendChild(el('p', 'sub', only.kind === 'undated' ? 'No dates, so nothing can be called new.' : 'Could not be reached.'));
      }
      return;
    }
    main.appendChild(el('h2', '', "What's new"));
    var ul = el('ul');
    apps.forEach(function (app) {
      var li = el('li');
      var row = el('div', 'row');
      row.appendChild(el('span', 'title', app.label));
      var status = app.kind === 'new' ? entries(app.items.length, 'new') : app.kind === 'none' ? 'Nothing new' : app.kind === 'first' ? 'Now tracking' : app.kind === 'undated' ? 'No dates' : 'Unreachable';
      row.appendChild(el('span', app.kind === 'new' ? 'count' : 'meta', status));
      li.appendChild(row);
      var newest = app.kind === 'new' ? app.items[0] : app.kind === 'first' ? app.newest : null;
      if (newest) li.appendChild(el('div', 'meta', 'Newest: ' + newest.title));
      ul.appendChild(li);
    });
    main.appendChild(ul);
  }

  function render(result) {
    var data = result.structuredContent || {};
    main.textContent = '';
    main.className = '';
    if (Array.isArray(data.apps)) {
      whatsNew(data);
    } else if (data.item) {
      main.className = 'full';
      main.appendChild(el('h2', '', data.app ? data.app.label : 'Entry'));
      main.appendChild(list([data.item], 1));
    } else if (Array.isArray(data.items)) {
      main.appendChild(el('h2', '', data.app ? data.app.label : 'Results'));
      main.appendChild(el('p', 'sub', data.items.length === 0 ? 'Nothing found.' : entries(data.items.length, '')));
      main.appendChild(list(data.items, 5));
    } else {
      main.appendChild(el('p', '', textOf(result)));
    }
    reportSize();
  }

  function reportSize() {
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    notify('ui/notifications/size-changed', { height: height });
  }

  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.body);

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'StackVoice answer card', version: '1.0.0' },
    appCapabilities: { availableDisplayModes: ['inline'] }
  }).then(function (result) {
    applyContext(result && result.hostContext);
    notify('ui/notifications/initialized');
  });
})();
`;

/** The whole view as one HTML5 document, as `resources/read` returns it. */
export const ANSWER_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StackVoice answer</title>
<style>${STYLE}</style>
</head>
<body>
<main id="card" aria-live="polite"></main>
<script>${SCRIPT}</script>
</body>
</html>
`;
