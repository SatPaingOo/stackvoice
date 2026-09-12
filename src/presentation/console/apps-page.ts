import { renderPage } from '../web/layout.js';
import { CONSOLE_CLIENT, CONSOLE_CSS, emptyState } from './client.js';

const FORMAT_OPTIONS = (
  [
    ['json', 'JSON'],
    ['rss', 'RSS feed'],
    ['atom', 'Atom feed'],
    ['csv', 'CSV'],
  ] as const
)
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join('');

/**
 * The apps route: what is connected, and one box for connecting more.
 *
 * A person pastes whatever they have — a feed, an API, a spreadsheet link, a
 * repository, a file name — and never has to say which kind it is. The server
 * works that out; the page only shows the guesses so they can be corrected.
 */
export function renderAppsPage(): string {
  return renderPage({
    title: 'Apps — StackVoice',
    nav: 'apps',
    css: CONSOLE_CSS + APPS_CSS,
    body: `
<main class="shell page">
  <div class="page-head row">
    <div class="grow">
      <h1>Your apps</h1>
      <p>Each one becomes a set of tools your assistant can call. Paste a news feed, an API,
        a spreadsheet link, a GitHub repository or a file, and StackVoice works out the rest.</p>
    </div>
    <button class="primary" id="new">Add an app</button>
  </div>

  <div class="card panel hidden" id="editor" style="margin-bottom:18px">
    <h2 id="editorTitle">Add an app</h2>
    <p class="soft" id="editorHint">Nothing is written until you save.</p>

    <div id="sourceStep">
      <div class="field">
        <label for="source">Where is the data?</label>
        <div class="source-row">
          <input id="source" type="text" autocomplete="off" spellcheck="false"
            placeholder="A feed or API link, owner/repo, or a file name">
          <input id="branch" type="text" class="hidden" placeholder="branch: main" aria-label="GitHub branch" spellcheck="false">
          <button class="primary" id="inspect">Look at it</button>
        </div>
      </div>
      <div class="kinds">
        <span class="muted">Try</span>
        <button type="button" class="kind" data-kind="feed">News feed</button>
        <button type="button" class="kind" data-kind="api">JSON API</button>
        <button type="button" class="kind" data-kind="sheet">Spreadsheet</button>
        <button type="button" class="kind" data-kind="repo">GitHub repo</button>
        <button type="button" class="kind" data-kind="file">File</button>
      </div>
      <p class="tip" id="tip"></p>
    </div>

    <details class="keybox hidden" id="keybox">
      <summary>This needs an API key</summary>
      <p class="soft">Kept on this server in <code>config/secrets.yml</code>. It is never written into the
        app file and never shown again, not even here.</p>
      <p class="soft hidden" id="keyInfo"></p>
      <div class="three">
        <div class="field">
          <label for="hName">Header</label>
          <input id="hName" type="text" value="Authorization" spellcheck="false">
        </div>
        <div class="field">
          <label for="hPrefix">Before the key <span class="hint">— often Bearer</span></label>
          <input id="hPrefix" type="text" value="Bearer" spellcheck="false">
        </div>
        <div class="field">
          <label for="secretName">Saved as</label>
          <input id="secretName" type="text" list="secretList" placeholder="MY_API_KEY" spellcheck="false">
          <datalist id="secretList"></datalist>
        </div>
      </div>
      <div class="field">
        <label for="secretValue">Key <span class="hint" id="secretState"></span></label>
        <input id="secretValue" type="password" autocomplete="new-password" placeholder="paste the key">
      </div>
      <div class="row hidden" id="dropRow" style="margin-top:12px">
        <button type="button" class="small ghost" id="dropKey">Stop sending a key</button>
      </div>
    </details>

    <div id="sourceNote"></div>

    <div id="details" class="hidden">
      <div class="found" id="found"></div>

      <div class="two">
        <div class="field">
          <label for="id">App id <span class="hint">— the tool prefix, like notes_search</span></label>
          <input id="id" type="text" placeholder="notes" spellcheck="false">
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
        <label>Where each spoken field lives <span class="hint">— one column, or several such as {Date}: {Price}</span></label>
        <div class="map" id="fields"></div>
        <div class="columns hidden" id="columnsBox">
          <p class="muted">Columns in this data. Click one to put it in the field you picked last.</p>
          <div class="picks" id="columns"></div>
        </div>
        <button type="button" class="small ghost hidden" id="loadColumns" style="margin-top:10px">Show the columns in this data</button>
      </div>

      <details class="advanced" id="advanced">
        <summary>Where it is read from</summary>
        <div id="locUrl" class="loc hidden">
          <div class="field"><label for="uUrl">Address</label><input id="uUrl" type="text" spellcheck="false"></div>
          <div class="field"><label for="uFormat">Format</label><select id="uFormat">${FORMAT_OPTIONS}</select></div>
        </div>
        <div id="locFile" class="loc hidden">
          <div class="field"><label for="fPath">File <span class="hint">— inside the data folder</span></label><input id="fPath" type="text" spellcheck="false"></div>
          <div class="field"><label for="fFormat">Format</label><select id="fFormat">${FORMAT_OPTIONS}</select></div>
        </div>
        <div id="locGithub" class="loc github hidden">
          <div class="field"><label for="gRepo">Repository</label><input id="gRepo" type="text" spellcheck="false"></div>
          <div class="field"><label for="gBranch">Branch</label><input id="gBranch" type="text" spellcheck="false"></div>
          <div class="field"><label for="gIndex">Records file</label><input id="gIndex" type="text" spellcheck="false"></div>
          <div class="field"><label for="gStats">Status file</label><input id="gStats" type="text" spellcheck="false"></div>
        </div>
        <div class="field items">
          <label for="itemsPath">Records are under <span class="hint">— empty when the whole document is the list</span></label>
          <input id="itemsPath" type="text" placeholder="data.items" spellcheck="false">
        </div>
        <div class="field hidden" id="statusBox">
          <label>Where the freshness and count live</label>
          <div class="map" id="statusFields"></div>
        </div>
      </details>

      <div id="editorNote"></div>
      <div class="row" style="margin-top:18px">
        <button class="primary" id="save">Save app</button>
        <button class="ghost" id="cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="listNote"></div>
  <div id="apps" class="list"></div>
</main>`,
    script: CONSOLE_CLIENT + emptyMarkup() + APPS_SCRIPT,
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

const APPS_CSS = `
  .source-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .source-row #source { flex: 1 1 320px; min-width: 0; font: 14.5px/1.5 var(--mono); }
  .source-row #branch { flex: 0 0 140px; font: 14px/1.5 var(--mono); }

  .kinds { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 12px; font-size: 13.5px; }
  .kinds .muted { margin-right: 2px; }
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

  .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .two > .field + .field, .three > .field + .field, .loc > .field + .field { margin-top: 0; }
  .loc { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 12px; }
  .loc.github { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  details.advanced .field.items { margin-top: 14px; }

  .found { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 18px 0 16px;
           font-size: 14px; color: var(--ink-soft); overflow-wrap: anywhere; }
  .kind-tag { display: inline-block; font: 600 11.5px/1.6 var(--sans); letter-spacing: .04em; text-transform: uppercase;
              color: var(--accent-ink); background: var(--accent-soft); border-radius: 6px; padding: 1px 8px;
              white-space: nowrap; }
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
    .source-row #branch { flex: 1 1 100%; }
    .source-row #inspect { flex: 1 1 100%; justify-content: center; }
  }
`;

// String.raw keeps the backslashes in the regular expressions below intact.
const APPS_SCRIPT = String.raw`
var FIELDS = [['title', 'title'], ['summary', 'summary'], ['date', 'date'], ['key', 'key'],
  ['topic', 'topic'], ['region', 'region'], ['url', 'link']];
var STATUS_FIELDS = [['lastDataDate', 'freshness'], ['itemCount', 'item count']];
var FORMAT_NAMES = { rss: 'RSS feed', atom: 'Atom feed', json: 'JSON', csv: 'CSV' };
var EXAMPLES = {
  feed: ['https://feeds.bbci.co.uk/news/world/rss.xml',
    'Any RSS or Atom feed. Most news sites, blogs, podcasts and YouTube channels have one.'],
  api: ['https://api.github.com/repos/nodejs/node/releases',
    'Any address that answers with JSON. If it needs a key, open the key section that appears below.'],
  sheet: ['https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv',
    'A CSV link. For a Google Sheet: File, Share, Publish to web, choose CSV, and paste the link it gives you.'],
  repo: ['SatPaingOo/information-hub',
    'A public GitHub repository that publishes JSON, as owner/name or its github.com link.'],
  file: ['', 'Put a .json, .csv or .xml file in the data folder on this server, then type its name, such as prices.csv.']
};

var editing = null;
var loc = null;
var samples = {};
var lastField = null;
var knownSecrets = [];
var currentApps = [];
var keyTouched = false;
var keyDropped = false;
var nameTouched = false;

// ---- what was pasted --------------------------------------------------------

function looksLikeRepo(text) {
  return /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+?(\.git)?(\/tree\/[^\/?#]+)?\/?$/i.test(text) ||
    (/^[\w-]+\/[\w.-]+$/.test(text) && !/\.(json|csv|tsv|xml|rss|atom)$/i.test(text));
}

function looksLikeLink(text) {
  return /^https?:\/\//i.test(text) && !looksLikeRepo(text);
}

function nameFrom(input) {
  var text = input.trim();
  if (looksLikeRepo(text)) {
    var parts = text.replace(/^https?:\/\/(www\.)?github\.com\//i, '').split('/');
    return (parts[1] || parts[0]).replace(/\.git$/, '').replace(/[-_.]+/g, ' ');
  }
  if (looksLikeLink(text)) {
    try { return new URL(text).hostname.replace(/^www\./, ''); } catch (e) { return text; }
  }
  var file = text.split('/').pop() || text;
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_.]+/g, ' ');
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toId(text) {
  var id = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z]/.test(id)) id = 'app-' + id;
  id = id.slice(0, 32).replace(/-+$/, '');
  return id.length >= 2 ? id : 'my-app';
}

function kindOf(location) {
  if (location.type === 'github-repo') return 'GitHub';
  var name = FORMAT_NAMES[location.format] || String(location.format).toUpperCase();
  return location.type === 'file' ? 'File · ' + name : name;
}

function describeLocation(location) {
  if (location.type === 'github-repo') return location.repo;
  if (location.type === 'file') return location.path;
  try {
    var url = new URL(location.url);
    return url.host + (url.pathname === '/' ? '' : url.pathname);
  } catch (e) {
    return location.url;
  }
}

// ---- the key ----------------------------------------------------------------

function secretNameFor(text) {
  var host = '';
  try { host = new URL(text).hostname; } catch (e) { host = ''; }
  var word = host.replace(/^(www|api)\./i, '').split('.')[0] || 'api';
  var name = word.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!/^[A-Z]/.test(name)) name = 'KEY_' + name;
  return (name + '_KEY').slice(0, 64);
}

function refreshSecrets() {
  return api('GET', '/console/api/secrets')
    .then(function (data) {
      knownSecrets = data.secrets.map(function (secret) { return secret.name; });
      var list = el('secretList');
      list.innerHTML = '';
      knownSecrets.forEach(function (name) {
        var option = document.createElement('option');
        option.value = name;
        list.appendChild(option);
      });
      secretState();
    })
    .catch(function () {});
}

function secretState() {
  var name = el('secretName').value.trim();
  el('secretState').textContent = name && knownSecrets.indexOf(name) !== -1
    ? '— one is saved as ' + name + '. Leave this empty to keep it.'
    : '';
}

function keyWanted() {
  return !el('keybox').classList.contains('hidden') && el('keybox').open && !keyDropped;
}

function keyProblem() {
  var name = el('secretName').value.trim();
  if (!el('hName').value.trim()) return 'Say which header carries the key. Most APIs use Authorization.';
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) {
    return 'Save the key under a name in capital letters, digits and underscores, such as MY_API_KEY.';
  }
  if (!el('secretValue').value.trim() && knownSecrets.indexOf(name) === -1) {
    return 'Paste the key, or pick a name that is already saved.';
  }
  return null;
}

function keyHeaders() {
  var prefix = el('hPrefix').value.trim();
  var headers = {};
  headers[el('hName').value.trim()] = (prefix ? prefix + ' ' : '') + '{{secret:' + el('secretName').value.trim() + '}}';
  return headers;
}

/** A pasted key is stored first, so the server can use it to look at the link. */
function storeKey() {
  var value = el('secretValue').value.trim();
  if (!keyWanted() || !value) return Promise.resolve();
  var name = el('secretName').value.trim();
  return api('PUT', '/console/api/secrets/' + encodeURIComponent(name), { value: value }).then(function () {
    el('secretValue').value = '';
    return refreshSecrets();
  });
}

function resetKeybox(location) {
  keyTouched = false;
  keyDropped = false;
  nameTouched = false;
  el('secretValue').value = '';
  el('dropRow').classList.add('hidden');
  el('keyInfo').classList.add('hidden');

  var header = location && location.headers && location.headers[0];
  if (header && header.secret) {
    el('hName').value = header.name;
    el('hPrefix').value = header.prefix || '';
    el('secretName').value = header.secret;
    el('keybox').open = true;
    el('dropRow').classList.remove('hidden');
  } else {
    el('hName').value = 'Authorization';
    el('hPrefix').value = 'Bearer';
    el('secretName').value = '';
    el('keybox').open = false;
    if (header) {
      // Written into the app file by hand. Its value stays there, untouched, unless replaced here.
      el('keyInfo').textContent = 'This app sends a ' + header.name + ' header set in its app file. Saving a key here replaces it.';
      el('keyInfo').classList.remove('hidden');
    }
  }
  secretState();
}

['hName', 'hPrefix', 'secretName', 'secretValue'].forEach(function (id) {
  el(id).addEventListener('input', function () {
    keyTouched = true;
    keyDropped = false;
    if (id === 'secretName') nameTouched = true;
    secretState();
  });
});

el('keybox').addEventListener('toggle', function () {
  if (el('keybox').open && !editing && !el('secretName').value.trim()) {
    el('secretName').value = secretNameFor(el('source').value.trim());
  }
  secretState();
});

el('dropKey').addEventListener('click', function () {
  keyDropped = true;
  keyTouched = true;
  el('keybox').open = false;
  note('editorNote', 'info', 'Saving will stop sending the key. The key itself stays saved under Settings.');
});

// ---- the source box ---------------------------------------------------------

el('source').addEventListener('input', function () {
  var text = el('source').value.trim();
  el('branch').classList.toggle('hidden', !looksLikeRepo(text));
  el('keybox').classList.toggle('hidden', !looksLikeLink(text));
  if (looksLikeLink(text) && !nameTouched) el('secretName').value = secretNameFor(text);
  secretState();
  // A different source needs a fresh look before anything can be saved.
  el('details').classList.add('hidden');
  note('sourceNote', 'info', '');
});

el('source').addEventListener('keydown', function (event) {
  if (event.key === 'Enter') el('inspect').click();
});

Array.prototype.forEach.call(document.querySelectorAll('button.kind'), function (button) {
  button.addEventListener('click', function () {
    var example = EXAMPLES[button.dataset.kind];
    Array.prototype.forEach.call(document.querySelectorAll('button.kind'), function (other) {
      other.classList.toggle('on', other === button);
    });
    el('tip').textContent = example[1];
    el('source').value = example[0];
    el('source').dispatchEvent(new Event('input'));
    el('source').focus();
  });
});

el('inspect').addEventListener('click', function () {
  var input = el('source').value.trim();
  if (!input) {
    note('sourceNote', 'err', 'Paste a link, a GitHub repository or a file name first.');
    return;
  }
  var withKey = looksLikeLink(input) && keyWanted();
  if (withKey) {
    var problem = keyProblem();
    if (problem) { note('sourceNote', 'err', problem); return; }
  }

  note('sourceNote', 'info', 'Looking at ' + input + '...');
  busy(el('inspect'), true, 'Looking...');

  storeKey()
    .then(function () {
      return api('POST', '/console/api/inspect', {
        input: input,
        branch: looksLikeRepo(input) ? el('branch').value.trim() : '',
        headers: withKey ? keyHeaders() : {}
      });
    })
    .then(function (data) {
      showProposal(data.proposal, input);
      note('sourceNote', 'ok', 'Found ' + data.proposal.itemCount.toLocaleString() + ' records. Check the guesses below, then save.');
    })
    .catch(function (error) { note('sourceNote', 'err', error.message); })
    .then(function () { busy(el('inspect'), false); });
});

// ---- the details ------------------------------------------------------------

function showProposal(p, input) {
  samples = {};
  (p.evidence || []).forEach(function (row) { samples[row.field] = row.sample; });
  loc = p.location;

  var name = p.suggestedLabel || nameFrom(input);
  el('details').classList.remove('hidden');
  el('id').value = toId(name);
  el('label').value = capitalize(name);
  el('description').value = 'Records from ' + describeLocation(p.location) +
    '. Say in your own words what is in it: your assistant reads this to decide when to use the app.';
  el('pSearch').checked = p.suggestedPrimitives.search;
  el('pRead').checked = p.suggestedPrimitives.read;
  el('pStatus').checked = p.suggestedPrimitives.status;

  fillLocation(p.location, p.itemsPath);
  buildFields(p.fields);
  buildColumns(p.availableKeys);
  buildStatus(p.statusFields);
  showFound(p.location, p.itemCount);
  el('loadColumns').classList.add('hidden');
  note('editorNote', 'info', '');
}

function showFound(location, count) {
  var box = el('found');
  box.innerHTML = '';
  box.appendChild(make('span', 'kind-tag', kindOf(location)));
  box.appendChild(make('span', null,
    (count == null ? '' : count.toLocaleString() + ' records · ') + describeLocation(location)));
}

function fillLocation(location, itemsPath) {
  ['locUrl', 'locFile', 'locGithub'].forEach(function (id) { el(id).classList.add('hidden'); });
  el('statusBox').classList.toggle('hidden', location.type !== 'github-repo');
  el('keybox').classList.toggle('hidden', location.type !== 'url');

  if (location.type === 'github-repo') {
    el('locGithub').classList.remove('hidden');
    el('gRepo').value = location.repo;
    el('gBranch').value = location.branch || 'main';
    el('gIndex').value = location.indexFile;
    el('gStats').value = location.statsFile;
  } else if (location.type === 'url') {
    el('locUrl').classList.remove('hidden');
    el('uUrl').value = location.url;
    el('uFormat').value = location.format;
  } else {
    el('locFile').classList.remove('hidden');
    el('fPath').value = location.path;
    el('fFormat').value = location.format;
  }
  el('itemsPath').value = itemsPath || '';
}

function readLocation() {
  if (loc.type === 'github-repo') {
    return {
      type: 'github-repo',
      repo: el('gRepo').value.trim(),
      branch: el('gBranch').value.trim(),
      indexFile: el('gIndex').value.trim(),
      statsFile: el('gStats').value.trim()
    };
  }
  if (loc.type === 'file') {
    return { type: 'file', path: el('fPath').value.trim(), format: el('fFormat').value };
  }
  var out = { type: 'url', url: el('uUrl').value.trim(), format: el('uFormat').value };
  // Leaving headers out tells the server to keep the ones it has, which the page never sees.
  if (keyDropped) out.headers = {};
  else if (keyWanted() && (!editing || keyTouched)) out.headers = keyHeaders();
  else if (!editing) out.headers = {};
  return out;
}

function mapHead(grid, a, b, c) {
  [a, b, c].forEach(function (text) { grid.appendChild(make('div', 'head', text)); });
}

function mapRow(grid, name, label, value, sample) {
  grid.appendChild(make('div', 'name', label));
  var input = document.createElement('input');
  input.type = 'text';
  input.spellcheck = false;
  input.dataset.name = name;
  input.value = value == null ? '' : value;
  input.placeholder = 'not set';
  grid.appendChild(input);
  grid.appendChild(make('div', 'sample', sample == null ? '' : sample));
  return input;
}

function buildFields(fields) {
  var grid = el('fields');
  grid.innerHTML = '';
  lastField = null;
  mapHead(grid, 'Field', 'Read from', 'Example');
  FIELDS.forEach(function (pair) {
    var input = mapRow(grid, pair[0], pair[1], fields[pair[0]], samples[pair[0]]);
    input.addEventListener('focus', function () {
      if (lastField) lastField.classList.remove('picked');
      lastField = input;
      input.classList.add('picked');
    });
  });
}

function buildColumns(keys) {
  var box = el('columns');
  box.innerHTML = '';
  (keys || []).forEach(function (key) {
    var pick = make('button', 'small', key);
    pick.type = 'button';
    pick.addEventListener('click', function () { putColumn(key); });
    box.appendChild(pick);
  });
  el('columnsBox').classList.toggle('hidden', !(keys && keys.length));
}

/** An empty field takes the column. A filled one gains it, so Date then Price reads {Date} {Price}. */
function putColumn(key) {
  var target = lastField || el('fields').querySelector('input[data-name="title"]');
  var current = target.value.trim();
  if (!current) target.value = key;
  else if (current.indexOf('{') === -1) target.value = '{' + current + '} {' + key + '}';
  else target.value = current + ' {' + key + '}';
  target.focus();
}

function buildStatus(statusFields) {
  var grid = el('statusFields');
  grid.innerHTML = '';
  mapHead(grid, 'Reads', 'From', '');
  STATUS_FIELDS.forEach(function (pair) { mapRow(grid, pair[0], pair[1], statusFields[pair[0]], null); });
}

function readMap(id) {
  var out = {};
  Array.prototype.forEach.call(el(id).querySelectorAll('input'), function (input) {
    var value = input.value.trim();
    out[input.dataset.name] = value === '' ? null : value;
  });
  return out;
}

el('loadColumns').addEventListener('click', function () {
  var location = readLocation();
  var input = location.type === 'github-repo' ? location.repo : location.type === 'url' ? location.url : location.path;
  if (location.type === 'url' && keyWanted() && keyTouched) {
    var problem = keyProblem();
    if (problem) { note('editorNote', 'err', problem); return; }
  }

  busy(el('loadColumns'), true, 'Looking...');
  storeKey()
    .then(function () {
      return api('POST', '/console/api/inspect', {
        input: input,
        branch: location.branch || '',
        headers: location.type === 'url' && keyWanted() ? keyHeaders() : {}
      });
    })
    .then(function (data) {
      buildColumns(data.proposal.availableKeys);
      showFound(location, data.proposal.itemCount);
      el('loadColumns').classList.add('hidden');
    })
    .catch(function (error) { note('editorNote', 'err', error.message); })
    .then(function () { busy(el('loadColumns'), false); });
});

// ---- open, save, close ------------------------------------------------------

function openEditor(app) {
  editing = app;
  samples = {};
  loc = app ? app.location : null;
  el('editor').classList.remove('hidden');
  note('editorNote', 'info', '');
  note('sourceNote', 'info', '');
  el('editorTitle').textContent = app ? 'Edit ' + app.label : 'Add an app';
  resetKeybox(app ? app.location : null);
  refreshSecrets();

  if (app) {
    el('sourceStep').classList.add('hidden');
    el('details').classList.remove('hidden');
    el('editorHint').textContent = 'Anything here can be changed. Saving takes effect immediately.';
    el('id').value = app.id;
    el('id').disabled = true;
    el('label').value = app.label;
    el('description').value = app.description;
    el('pSearch').checked = app.primitives.search;
    el('pRead').checked = app.primitives.read;
    el('pStatus').checked = app.primitives.status;
    fillLocation(app.location, app.itemsPath);
    buildFields(app.fields);
    buildColumns([]);
    buildStatus(app.statusFields);
    showFound(app.location, null);
    el('loadColumns').classList.remove('hidden');
    if (app.missingSecrets && app.missingSecrets.length) {
      note('editorNote', 'warn', 'The key ' + app.missingSecrets.join(', ') +
        ' is not saved on this server. Paste it in the key section, then save.');
    }
  } else {
    el('sourceStep').classList.remove('hidden');
    el('details').classList.add('hidden');
    el('keybox').classList.add('hidden');
    el('branch').classList.add('hidden');
    el('editorHint').textContent = 'Nothing is written until you save.';
    el('id').disabled = false;
    ['source', 'branch', 'id', 'label', 'description'].forEach(function (id) { el(id).value = ''; });
    el('tip').textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('button.kind'), function (b) { b.classList.remove('on'); });
  }

  el('advanced').open = false;
  el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!app) el('source').focus({ preventScroll: true });
}

function closeEditor() {
  editing = null;
  el('editor').classList.add('hidden');
}

el('save').addEventListener('click', function () {
  var id = el('id').value.trim();
  if (!id) { note('editorNote', 'err', 'An app id is required.'); return; }
  if (loc.type === 'url' && keyWanted() && (!editing || keyTouched)) {
    var problem = keyProblem();
    if (problem) { note('editorNote', 'err', problem); return; }
  }
  var clash = !editing && currentApps.some(function (app) { return app.id === id; });
  if (clash && !window.confirm('An app called ' + id + ' already exists. Replace it? A backup is kept in config/backups.')) return;

  var body = {
    label: el('label').value,
    description: el('description').value,
    enabled: editing ? editing.enabled : true,
    primitives: { search: el('pSearch').checked, read: el('pRead').checked, status: el('pStatus').checked },
    location: readLocation(),
    itemsPath: el('itemsPath').value.trim() || null,
    fields: readMap('fields'),
    statusFields: readMap('statusFields')
  };

  busy(el('save'), true, 'Saving...');
  storeKey()
    .then(function () { return api('PUT', '/console/api/apps/' + encodeURIComponent(id), body); })
    .then(function () { closeEditor(); return load(); })
    .catch(function (error) { note('editorNote', 'err', error.message); })
    .then(function () { busy(el('save'), false); });
});

el('cancel').addEventListener('click', closeEditor);
el('new').addEventListener('click', function () { openEditor(null); });

// ---- the list ---------------------------------------------------------------

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
  currentApps = apps;
  var list = el('apps');
  list.innerHTML = '';

  if (!apps.length) { list.innerHTML = EMPTY_HTML; return; }

  apps.forEach(function (app) {
    var card = make('div', 'card item');
    var main = make('div', 'main');
    main.appendChild(make('h3', null, app.label));

    var meta = make('p', 'meta');
    meta.appendChild(make('span', 'kind-tag', kindOf(app.location)));
    meta.appendChild(document.createTextNode(app.from));
    main.appendChild(meta);

    var health = make('div', 'health');
    health.appendChild(make('span', 'dot ' + (!app.enabled ? '' : app.health && app.health.ok ? 'ok' : 'bad')));
    health.appendChild(document.createTextNode(healthLine(app)));
    main.appendChild(health);

    if (app.missingSecrets && app.missingSecrets.length) {
      main.appendChild(make('div', 'note warn', 'Needs the key ' + app.missingSecrets.join(', ') + '. Open Edit and paste it.'));
    }

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
        .catch(function (error) { busy(toggle, false); note('listNote', 'err', error.message); });
    });
    actions.appendChild(toggle);

    var remove = make('button', 'small danger', 'Remove');
    remove.addEventListener('click', function () {
      if (!window.confirm('Remove ' + app.label + '? A backup is kept in config/backups.')) return;
      busy(remove, true, '...');
      api('DELETE', '/console/api/apps/' + app.id)
        .then(load)
        .catch(function (error) { busy(remove, false); note('listNote', 'err', error.message); });
    });
    actions.appendChild(remove);

    card.appendChild(actions);
    list.appendChild(card);
  });
}

function load() {
  return api('GET', '/console/api/apps')
    .then(function (data) { note('listNote', 'info', ''); render(data.apps); })
    .catch(function (error) { note('listNote', 'err', error.message); });
}

load();
`;
