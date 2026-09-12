export interface ConsolePageState {
  readonly requiresLogin: boolean;
  readonly signedIn: boolean;
}

/**
 * The console page: one self-contained document, no build step and no CDN.
 *
 * Everything a person needs to point StackVoice at their own data lives here —
 * paste a repository, look at what was inferred, correct anything that is
 * wrong, save. No terminal, no YAML, no schema to learn.
 */
export function renderConsolePage(state: ConsolePageState): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StackVoice — console</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f4f2; --panel: #fff; --line: #e4e2dd; --ink: #191917; --muted: #6f6d66;
    --accent: #c96442; --chip: #efede8; --ok: #3f7d58; --bad: #b5372a; --warn: #b07d2b;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #191917; --panel: #232320; --line: #35342f; --ink: #f2f0eb; --muted: #a3a099;
            --chip: #2c2b27; --ok: #6cc08b; --bad: #e0705f; --warn: #d9a441; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 28px 18px 80px; }
  a { color: var(--accent); }

  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.01em; }
  .grow { flex: 1; }
  .sub { color: var(--muted); font-size: 14px; margin: 0 0 24px; }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
          padding: 18px; margin-bottom: 14px; }
  .app { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .app .main { flex: 1; min-width: 240px; }
  .app h3 { margin: 0 0 3px; font-size: 16px; }
  .app .meta { color: var(--muted); font-size: 13px; margin: 0 0 8px; }
  .tools { display: flex; gap: 6px; flex-wrap: wrap; }
  .tool { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--chip);
          border-radius: 5px; padding: 2px 7px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .dot.ok { background: var(--ok); } .dot.bad { background: var(--bad); } .dot.off { background: var(--muted); }
  .health { font-size: 13px; color: var(--muted); }

  button { font: inherit; border-radius: 8px; cursor: pointer; padding: 8px 14px; border: 1px solid var(--line);
           background: var(--panel); color: var(--ink); }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); color: #fff; border-color: transparent; font-weight: 600; }
  button.danger:hover { border-color: var(--bad); color: var(--bad); }
  button:disabled { opacity: .5; cursor: default; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  label { display: block; font-size: 13px; color: var(--muted); margin: 12px 0 5px; }
  input[type=text], textarea, input[type=password] {
    width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); color: var(--ink); font: inherit; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  textarea { min-height: 62px; resize: vertical; }
  .checks { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 8px; }
  .checks label { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--ink); font-size: 14px; }

  .grid { display: grid; grid-template-columns: 110px 1fr 1fr; gap: 8px 12px; align-items: center; margin-top: 6px; }
  .grid .head { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .grid input { padding: 7px 9px; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .sample { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; gap: 4px; }
    .grid .head:nth-child(n+2), .sample { display: none; }
  }

  .note { font-size: 13px; padding: 10px 12px; border-radius: 8px; margin-top: 12px; }
  .note.err { background: color-mix(in srgb, var(--bad) 12%, transparent); color: var(--bad); }
  .note.ok { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
  .note.info { background: var(--chip); color: var(--muted); }
  .hidden { display: none !important; }
  .spin { color: var(--muted); font-size: 14px; }
  h2 { font-size: 16px; margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: 13px; margin: 0 0 4px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>StackVoice</h1>
    <span class="grow"></span>
    <a href="/simulator">Try it by voice →</a>
    ${state.requiresLogin ? '<button id="logout" class="hidden">Sign out</button>' : ''}
  </header>
  <p class="sub">Point your assistant at your own data. No terminal, no YAML.</p>

  <div id="login" class="card ${state.requiresLogin && !state.signedIn ? '' : 'hidden'}">
    <h2>Sign in</h2>
    <p class="hint">Enter the <code>auth.token</code> from your own <code>config/settings.yml</code>.</p>
    <label for="token">Owner token</label>
    <input id="token" type="password" autocomplete="off">
    <div class="row" style="margin-top:12px"><button class="primary" id="signin">Sign in</button></div>
    <div id="loginNote"></div>
  </div>

  <div id="main" class="${state.requiresLogin && !state.signedIn ? 'hidden' : ''}">
    <div class="row" style="margin-bottom:14px">
      <button class="primary" id="new">Add an app</button>
      <button id="refresh">Refresh</button>
      <span class="grow"></span>
      <span class="spin" id="spin"></span>
    </div>

    <div id="editor" class="card hidden">
      <h2 id="editorTitle">Add an app</h2>
      <p class="hint" id="editorHint">Paste a public GitHub repository that publishes JSON. StackVoice will work out the rest.</p>

      <div id="repoStep">
        <label for="repo">Repository</label>
        <div class="row">
          <input id="repo" type="text" placeholder="owner/name" style="flex:1;min-width:200px">
          <input id="branch" type="text" placeholder="main" style="width:120px">
          <button class="primary" id="inspect">Look at it</button>
        </div>
      </div>

      <div id="details" class="hidden">
        <label for="id">App id <span class="hint">— becomes the tool prefix, like <code>notes_search</code></span></label>
        <input id="id" type="text" placeholder="notes">

        <label for="label">Name</label>
        <input id="label" type="text" placeholder="My notes">

        <label for="description">What is in it <span class="hint">— the assistant reads this to decide when to use it</span></label>
        <textarea id="description"></textarea>

        <label>Tools to expose</label>
        <div class="checks">
          <label><input type="checkbox" id="pSearch"> search</label>
          <label><input type="checkbox" id="pRead"> read</label>
          <label><input type="checkbox" id="pStatus"> status</label>
        </div>

        <label>Where each spoken field lives <span class="hint">— change anything that looks wrong</span></label>
        <div class="grid" id="fields"></div>

        <label>Where the freshness and count live</label>
        <div class="grid" id="statusFields"></div>

        <label>Files</label>
        <div class="grid" id="files"></div>

        <div id="editorNote"></div>
        <div class="row" style="margin-top:14px">
          <button class="primary" id="save">Save</button>
          <button id="cancel">Cancel</button>
        </div>
      </div>
    </div>

    <div id="apps"></div>
  </div>
</div>

<script>
(function () {
  var el = function (id) { return document.getElementById(id); };
  var FIELDS = ['key', 'title', 'summary', 'date', 'topic', 'region', 'url'];
  var STATUS_FIELDS = [['lastDataDate', 'freshness'], ['itemCount', 'item count']];
  var FILES = [['indexFile', 'records'], ['statsFile', 'status'], ['itemsPath', 'nested under']];
  var editing = null;
  var samples = {};

  function spin(text) { el('spin').textContent = text || ''; }

  function note(target, kind, text) {
    var box = el(target);
    box.innerHTML = '';
    if (!text) return;
    var div = document.createElement('div');
    div.className = 'note ' + kind;
    div.textContent = text;
    box.appendChild(div);
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  function inputRow(grid, name, label, value, sample) {
    var caption = document.createElement('div');
    caption.textContent = label;
    var input = document.createElement('input');
    input.type = 'text';
    input.dataset.name = name;
    input.value = value == null ? '' : value;
    input.placeholder = 'not set';
    var hint = document.createElement('div');
    hint.className = 'sample';
    hint.textContent = sample == null ? '' : sample;
    grid.appendChild(caption);
    grid.appendChild(input);
    grid.appendChild(hint);
  }

  function buildGrids(source) {
    var fields = el('fields');
    var status = el('statusFields');
    var files = el('files');
    [fields, status, files].forEach(function (grid) { grid.innerHTML = ''; });

    [[fields, 'FIELD', 'FROM', 'EXAMPLE'], [status, 'READS', 'FROM', 'EXAMPLE'], [files, 'FILE', 'PATH', '']]
      .forEach(function (spec) {
        ['', '', ''].forEach(function (_, i) {
          var head = document.createElement('div');
          head.className = 'head';
          head.textContent = spec[i + 1];
          spec[0].appendChild(head);
        });
      });

    FIELDS.forEach(function (name) {
      inputRow(fields, name, name, source.fields[name], samples[name]);
    });
    STATUS_FIELDS.forEach(function (pair) {
      inputRow(status, pair[0], pair[1], source.statusFields[pair[0]], null);
    });
    FILES.forEach(function (pair) {
      inputRow(files, pair[0], pair[1], source[pair[0]], null);
    });
  }

  function readGrid(id) {
    var out = {};
    Array.prototype.forEach.call(el(id).querySelectorAll('input'), function (input) {
      var value = input.value.trim();
      out[input.dataset.name] = value === '' ? null : value;
    });
    return out;
  }

  function openEditor(app) {
    editing = app;
    samples = {};
    el('editor').classList.remove('hidden');
    note('editorNote', 'info', '');
    el('editorTitle').textContent = app ? 'Edit ' + app.label : 'Add an app';

    if (app) {
      el('repoStep').classList.add('hidden');
      el('details').classList.remove('hidden');
      el('editorHint').textContent = 'Anything here can be changed. Saving takes effect immediately.';
      el('id').value = app.id;
      el('id').disabled = true;
      el('label').value = app.label;
      el('description').value = app.description;
      el('pSearch').checked = app.primitives.search;
      el('pRead').checked = app.primitives.read;
      el('pStatus').checked = app.primitives.status;
      el('repo').value = app.repo;
      buildGrids(app);
    } else {
      el('repoStep').classList.remove('hidden');
      el('details').classList.add('hidden');
      el('editorHint').textContent = 'Paste a public GitHub repository that publishes JSON. StackVoice will work out the rest.';
      el('id').disabled = false;
      el('repo').value = '';
      el('branch').value = '';
      el('id').value = '';
      el('label').value = '';
      el('description').value = '';
    }
    el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    editing = null;
    el('editor').classList.add('hidden');
  }

  el('inspect').addEventListener('click', function () {
    var repo = el('repo').value.trim();
    if (!repo) { note('editorNote', 'err', 'Give a repository as owner/name.'); return; }

    note('editorNote', 'info', 'Looking at ' + repo + '…');
    el('inspect').disabled = true;

    api('POST', '/console/api/inspect', { repo: repo, branch: el('branch').value.trim() })
      .then(function (data) {
        var p = data.proposal;
        samples = {};
        (p.evidence || []).forEach(function (row) { samples[row.field] = row.sample; });

        el('details').classList.remove('hidden');
        el('id').value = repo.split('/')[1].replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 32);
        el('label').value = repo.split('/')[1].replace(/[-_]+/g, ' ');
        el('description').value = 'Records published by ' + repo + '. Say what is in it, in your own words.';
        el('pSearch').checked = p.suggestedPrimitives.search;
        el('pRead').checked = p.suggestedPrimitives.read;
        el('pStatus').checked = p.suggestedPrimitives.status;
        buildGrids({
          fields: p.fields,
          statusFields: p.statusFields,
          indexFile: p.indexFile,
          statsFile: p.statsFile || p.indexFile,
          itemsPath: p.itemsPath
        });
        note('editorNote', 'ok', 'Found ' + p.itemCount + ' records. Check the guesses below, then save.');
      })
      .catch(function (error) { note('editorNote', 'err', error.message); })
      .then(function () { el('inspect').disabled = false; });
  });

  el('save').addEventListener('click', function () {
    var id = el('id').value.trim();
    if (!id) { note('editorNote', 'err', 'An app id is required.'); return; }

    var files = readGrid('files');
    var body = {
      label: el('label').value,
      description: el('description').value,
      enabled: editing ? editing.enabled : true,
      primitives: { search: el('pSearch').checked, read: el('pRead').checked, status: el('pStatus').checked },
      repo: el('repo').value.trim(),
      indexFile: files.indexFile || 'data/views/index.json',
      statsFile: files.statsFile || 'data/views/stats.json',
      itemsPath: files.itemsPath,
      fields: readGrid('fields'),
      statusFields: readGrid('statusFields')
    };

    el('save').disabled = true;
    note('editorNote', 'info', 'Saving…');

    api('PUT', '/console/api/apps/' + encodeURIComponent(id), body)
      .then(function () { closeEditor(); return load(); })
      .catch(function (error) { note('editorNote', 'err', error.message); })
      .then(function () { el('save').disabled = false; });
  });

  el('cancel').addEventListener('click', closeEditor);
  el('new').addEventListener('click', function () { openEditor(null); });
  el('refresh').addEventListener('click', function () { load(); });

  function healthLine(app) {
    if (!app.enabled) return 'disabled';
    if (!app.health) return 'not checked';
    var source = (app.health.sources || [])[0] || {};
    if (!app.health.ok) return source.lastError || 'not healthy';
    var parts = [];
    if (source.itemCount != null) parts.push(source.itemCount + ' items');
    if (source.lastDataDate) parts.push('fresh to ' + String(source.lastDataDate).slice(0, 10));
    return parts.join(' · ') || 'healthy';
  }

  function render(apps) {
    var list = el('apps');
    list.innerHTML = '';

    if (!apps.length) {
      var empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = '<h2>No apps yet</h2><p class="hint">Add one and your assistant can start answering from your own data.</p>';
      list.appendChild(empty);
      return;
    }

    apps.forEach(function (app) {
      var card = document.createElement('div');
      card.className = 'card app';

      var main = document.createElement('div');
      main.className = 'main';

      var title = document.createElement('h3');
      title.textContent = app.label;
      main.appendChild(title);

      var meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = app.repo;
      main.appendChild(meta);

      var health = document.createElement('div');
      health.className = 'health';
      var dot = document.createElement('span');
      dot.className = 'dot ' + (!app.enabled ? 'off' : app.health && app.health.ok ? 'ok' : 'bad');
      health.appendChild(dot);
      health.appendChild(document.createTextNode(healthLine(app)));
      main.appendChild(health);

      var tools = document.createElement('div');
      tools.className = 'tools';
      tools.style.marginTop = '8px';
      (app.tools.length ? app.tools : ['no tools']).forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'tool';
        chip.textContent = name;
        tools.appendChild(chip);
      });
      main.appendChild(tools);
      card.appendChild(main);

      var actions = document.createElement('div');
      actions.className = 'row';

      var edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { openEditor(app); });
      actions.appendChild(edit);

      var toggle = document.createElement('button');
      toggle.textContent = app.enabled ? 'Disable' : 'Enable';
      toggle.addEventListener('click', function () {
        spin('Saving…');
        api('POST', '/console/api/apps/' + app.id + '/enabled', { enabled: !app.enabled })
          .then(load)
          .catch(function (error) { spin(error.message); });
      });
      actions.appendChild(toggle);

      var remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        if (!window.confirm('Remove ' + app.label + '? A backup is kept in config/backups.')) return;
        spin('Removing…');
        api('DELETE', '/console/api/apps/' + app.id).then(load).catch(function (error) { spin(error.message); });
      });
      actions.appendChild(remove);

      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function load() {
    spin('Loading…');
    return api('GET', '/console/api/apps')
      .then(function (data) { render(data.apps); spin(''); })
      .catch(function (error) { spin(error.message); });
  }

  var signin = el('signin');
  if (signin) {
    signin.addEventListener('click', function () {
      api('POST', '/console/api/login', { token: el('token').value })
        .then(function () {
          el('login').classList.add('hidden');
          el('main').classList.remove('hidden');
          var out = el('logout');
          if (out) out.classList.remove('hidden');
          return load();
        })
        .catch(function (error) { note('loginNote', 'err', error.message); });
    });
    el('token').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') signin.click();
    });
  }

  var logout = el('logout');
  if (logout) {
    logout.addEventListener('click', function () {
      api('POST', '/console/api/logout').then(function () { window.location.reload(); });
    });
  }

  if (!el('main').classList.contains('hidden')) {
    var out = el('logout');
    if (out) out.classList.remove('hidden');
    load();
  }
})();
</script>
</body>
</html>`;
}
