import { renderPage } from '../web/layout.js';
import { CONSOLE_CLIENT, CONSOLE_CSS, emptyState } from './client.js';

/** The apps route: what is connected, and the form for connecting more. */
export function renderAppsPage(): string {
  return renderPage({
    title: 'Apps — StackVoice',
    nav: 'apps',
    css: CONSOLE_CSS,
    body: `
<main class="shell page">
  <div class="page-head row">
    <div class="grow">
      <h1>Your apps</h1>
      <p>Each one becomes a set of tools your assistant can call. Point StackVoice at a
        public GitHub repository and it works out the rest.</p>
    </div>
    <button class="primary" id="new">Add an app</button>
  </div>

  <div class="card panel hidden" id="editor" style="margin-bottom:18px">
    <h2 id="editorTitle">Add an app</h2>
    <p class="soft" id="editorHint">Paste a repository that publishes JSON. Nothing is written until you save.</p>

    <div id="repoStep" class="field">
      <label for="repo">Repository</label>
      <div class="row" style="gap:8px">
        <input id="repo" type="text" placeholder="owner/name" style="flex:2;min-width:190px">
        <input id="branch" type="text" placeholder="main" style="flex:0 0 118px">
        <button class="primary" id="inspect">Look at it</button>
      </div>
    </div>

    <div id="details" class="hidden">
      <div class="two">
        <div class="field">
          <label for="id">App id <span class="hint">— the tool prefix, like notes_search</span></label>
          <input id="id" type="text" placeholder="notes">
        </div>
        <div class="field">
          <label for="label">Name</label>
          <input id="label" type="text" placeholder="My notes">
        </div>
      </div>

      <div class="field">
        <label for="description">What is in it <span class="hint">— your assistant reads this to decide when to use it</span></label>
        <textarea id="description"></textarea>
      </div>

      <div class="field">
        <label>Tools to expose</label>
        <div class="row" style="gap:20px">
          <label class="switch"><input type="checkbox" id="pSearch"> search</label>
          <label class="switch"><input type="checkbox" id="pRead"> read</label>
          <label class="switch"><input type="checkbox" id="pStatus"> status</label>
        </div>
      </div>

      <div class="field">
        <label>Where each spoken field lives <span class="hint">— change anything that looks wrong</span></label>
        <div class="map" id="fields"></div>
      </div>

      <div class="field">
        <label>Where the freshness and count live</label>
        <div class="map" id="statusFields"></div>
      </div>

      <div class="field">
        <label>Files</label>
        <div class="map" id="files"></div>
      </div>

      <div id="editorNote"></div>
      <div class="row" style="margin-top:18px">
        <button class="primary" id="save">Save app</button>
        <button class="ghost" id="cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="apps" class="list"></div>
</main>`,
    script: CONSOLE_CLIENT + APPS_SCRIPT + emptyMarkup(),
  });
}

/** Kept next to the script so the empty state and the renderer stay in step. */
function emptyMarkup(): string {
  return `
var EMPTY_HTML = ${JSON.stringify(
    emptyState(
      'Nothing connected yet',
      'Add your first app and your assistant can start answering from your own data.',
    ),
  )};
`;
}

const APPS_SCRIPT = `
var FIELDS = ['key', 'title', 'summary', 'date', 'topic', 'region', 'url'];
var STATUS_FIELDS = [['lastDataDate', 'freshness'], ['itemCount', 'item count']];
var FILES = [['indexFile', 'records'], ['statsFile', 'status'], ['itemsPath', 'nested under']];
var editing = null;
var samples = {};

function mapHead(grid, a, b, c) {
  [a, b, c].forEach(function (text) { grid.appendChild(make('div', 'head', text)); });
}

function mapRow(grid, name, label, value, sample) {
  grid.appendChild(make('div', 'name', label));
  var input = document.createElement('input');
  input.type = 'text';
  input.dataset.name = name;
  input.value = value == null ? '' : value;
  input.placeholder = 'not set';
  grid.appendChild(input);
  grid.appendChild(make('div', 'sample', sample == null ? '' : sample));
}

function buildMaps(source) {
  var fields = el('fields');
  var status = el('statusFields');
  var files = el('files');
  [fields, status, files].forEach(function (grid) { grid.innerHTML = ''; });

  mapHead(fields, 'Field', 'Read from', 'Example');
  FIELDS.forEach(function (name) { mapRow(fields, name, name, source.fields[name], samples[name]); });

  mapHead(status, 'Reads', 'From', '');
  STATUS_FIELDS.forEach(function (pair) { mapRow(status, pair[0], pair[1], source.statusFields[pair[0]], null); });

  mapHead(files, 'File', 'Path', '');
  FILES.forEach(function (pair) { mapRow(files, pair[0], pair[1], source[pair[0]], null); });
}

function readMap(id) {
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
    buildMaps(app);
  } else {
    el('repoStep').classList.remove('hidden');
    el('details').classList.add('hidden');
    el('editorHint').textContent = 'Paste a repository that publishes JSON. Nothing is written until you save.';
    el('id').disabled = false;
    ['repo', 'branch', 'id', 'label', 'description'].forEach(function (id) { el(id).value = ''; });
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

  note('editorNote', 'info', 'Looking at ' + repo + '...');
  busy(el('inspect'), true, 'Looking...');

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
      buildMaps({
        fields: p.fields,
        statusFields: p.statusFields,
        indexFile: p.indexFile,
        statsFile: p.statsFile || p.indexFile,
        itemsPath: p.itemsPath
      });
      note('editorNote', 'ok', 'Found ' + p.itemCount + ' records. Check the guesses, then save.');
    })
    .catch(function (error) { note('editorNote', 'err', error.message); })
    .then(function () { busy(el('inspect'), false); });
});

el('save').addEventListener('click', function () {
  var id = el('id').value.trim();
  if (!id) { note('editorNote', 'err', 'An app id is required.'); return; }

  var files = readMap('files');
  var body = {
    label: el('label').value,
    description: el('description').value,
    enabled: editing ? editing.enabled : true,
    primitives: { search: el('pSearch').checked, read: el('pRead').checked, status: el('pStatus').checked },
    repo: el('repo').value.trim(),
    indexFile: files.indexFile || 'data/views/index.json',
    statsFile: files.statsFile || 'data/views/stats.json',
    itemsPath: files.itemsPath,
    fields: readMap('fields'),
    statusFields: readMap('statusFields')
  };

  busy(el('save'), true, 'Saving...');
  api('PUT', '/console/api/apps/' + encodeURIComponent(id), body)
    .then(function () { closeEditor(); return load(); })
    .catch(function (error) { note('editorNote', 'err', error.message); })
    .then(function () { busy(el('save'), false); });
});

el('cancel').addEventListener('click', closeEditor);
el('new').addEventListener('click', function () { openEditor(null); });

function healthLine(app) {
  if (!app.enabled) return 'Disabled';
  if (!app.health) return 'Not checked yet';
  var source = (app.health.sources || [])[0] || {};
  if (!app.health.ok) return source.lastError || 'Not healthy';
  var parts = [];
  if (source.itemCount != null) parts.push(source.itemCount.toLocaleString() + ' records');
  if (source.lastDataDate) parts.push('fresh to ' + String(source.lastDataDate).slice(0, 10));
  return parts.join(' · ') || 'Healthy';
}

function render(apps) {
  var list = el('apps');
  list.innerHTML = '';

  if (!apps.length) { list.innerHTML = EMPTY_HTML; return; }

  apps.forEach(function (app) {
    var card = make('div', 'card item');
    var main = make('div', 'main');
    main.appendChild(make('h3', null, app.label));
    main.appendChild(make('p', 'meta', app.repo));

    var health = make('div', 'health');
    var dot = make('span', 'dot ' + (!app.enabled ? '' : app.health && app.health.ok ? 'ok' : 'bad'));
    health.appendChild(dot);
    health.appendChild(document.createTextNode(healthLine(app)));
    main.appendChild(health);

    var chips = make('div', 'chips');
    (app.tools.length ? app.tools : ['no tools']).forEach(function (name) {
      chips.appendChild(make('span', 'chip', name));
    });
    main.appendChild(chips);
    card.appendChild(main);

    var actions = make('div', 'actions');

    var edit = make('button', 'small', 'Edit');
    edit.addEventListener('click', function () { openEditor(app); });
    actions.appendChild(edit);

    var toggle = make('button', 'small', app.enabled ? 'Disable' : 'Enable');
    toggle.addEventListener('click', function () {
      busy(toggle, true, '...');
      api('POST', '/console/api/apps/' + app.id + '/enabled', { enabled: !app.enabled })
        .then(load)
        .catch(function (error) { busy(toggle, false); window.alert(error.message); });
    });
    actions.appendChild(toggle);

    var remove = make('button', 'small danger', 'Remove');
    remove.addEventListener('click', function () {
      if (!window.confirm('Remove ' + app.label + '? A backup is kept in config/backups.')) return;
      busy(remove, true, '...');
      api('DELETE', '/console/api/apps/' + app.id)
        .then(load)
        .catch(function (error) { busy(remove, false); window.alert(error.message); });
    });
    actions.appendChild(remove);

    card.appendChild(actions);
    list.appendChild(card);
  });
}

function load() {
  return api('GET', '/console/api/apps')
    .then(function (data) { render(data.apps); })
    .catch(function (error) { note('editorNote', 'err', error.message); });
}

load();
`;
