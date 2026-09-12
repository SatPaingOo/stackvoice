import { renderPage } from '../web/layout.js';
import { CONSOLE_CLIENT, CONSOLE_CSS, emptyState } from './client.js';

/** The shortcuts route: one tool that runs several. */
export function renderShortcutsPage(): string {
  return renderPage({
    title: 'Shortcuts — StackVoice',
    nav: 'shortcuts',
    css: CONSOLE_CSS,
    body: `
<main class="shell page">
  <div class="page-head row">
    <div class="grow">
      <h1>Shortcuts</h1>
      <p>One tool that runs several, so "what's my morning brief" is a single question.
        Name it the way you would say it out loud.</p>
    </div>
    <button class="primary" id="new">Add a shortcut</button>
  </div>

  <div class="card panel hidden" id="editor" style="margin-bottom:18px">
    <h2 id="editorTitle">Add a shortcut</h2>
    <p class="soft">Steps run in order. At most four, so the answer stays short enough to listen to.</p>

    <div class="two" style="margin-top:14px">
      <div class="field">
        <label for="name">Name <span class="hint">— becomes the tool <code id="toolName">-</code></span></label>
        <input id="name" type="text" placeholder="morning brief">
      </div>
      <div class="field">
        <label for="reply">How to answer <span class="hint">— {1}, {2} or {results}</span></label>
        <input id="reply" type="text" placeholder="Here is your brief. {results}">
      </div>
    </div>

    <div class="field">
      <label for="description">What it does <span class="hint">— your assistant reads this to decide when to run it</span></label>
      <textarea id="description"></textarea>
    </div>

    <div class="field">
      <label>Steps</label>
      <div id="steps"></div>
      <button class="small" id="addStep" style="margin-top:10px">Add a step</button>
    </div>

    <div id="editorNote"></div>
    <div class="row" style="margin-top:18px">
      <button class="primary" id="save">Save shortcut</button>
      <button class="ghost" id="cancel">Cancel</button>
    </div>
  </div>

  <div id="shortcuts" class="list"></div>
</main>`,
    script:
      CONSOLE_CLIENT +
      `var EMPTY_HTML = ${JSON.stringify(
        emptyState('No shortcuts yet', 'Add one to answer several questions with a single phrase.'),
      )};` +
      SHORTCUTS_SCRIPT,
  });
}

const SHORTCUTS_SCRIPT = `
var tools = [];
var editing = null;

function toolNameFor(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function stepRow(step) {
  var row = make('div', 'step');
  row.appendChild(make('span', 'num'));

  var select = document.createElement('select');
  tools.forEach(function (tool) {
    var option = make('option', null, tool.name);
    option.value = tool.name;
    select.appendChild(option);
  });
  if (step && step.tool) select.value = step.tool;
  row.appendChild(select);

  var args = document.createElement('input');
  args.type = 'text';
  args.placeholder = 'arguments, e.g. {"limit": 2}';
  args.value = step && step.args ? JSON.stringify(step.args) : '{}';
  row.appendChild(args);

  var drop = make('button', 'small ghost drop', 'Remove');
  drop.type = 'button';
  drop.addEventListener('click', function () { row.remove(); renumber(); });
  row.appendChild(drop);

  select.addEventListener('change', function () {
    var picked = tools.filter(function (t) { return t.name === select.value; })[0];
    if (picked && picked.takesQuery && args.value.trim() === '{}') args.value = '{"limit": 2}';
  });

  return row;
}

function renumber() {
  Array.prototype.forEach.call(el('steps').children, function (row, index) {
    row.querySelector('.num').textContent = String(index + 1);
  });
  el('addStep').disabled = el('steps').children.length >= 4;
}

function openEditor(shortcut) {
  editing = shortcut;
  el('editor').classList.remove('hidden');
  note('editorNote', 'info', '');
  el('editorTitle').textContent = shortcut ? 'Edit ' + shortcut.name : 'Add a shortcut';
  el('name').value = shortcut ? shortcut.name : '';
  el('description').value = shortcut ? shortcut.description : '';
  el('reply').value = shortcut ? shortcut.reply : '';
  el('toolName').textContent = shortcut ? shortcut.toolName : '-';

  var steps = el('steps');
  steps.innerHTML = '';
  (shortcut && shortcut.steps.length ? shortcut.steps : [null]).forEach(function (step) {
    steps.appendChild(stepRow(step));
  });
  renumber();
  el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  editing = null;
  el('editor').classList.add('hidden');
}

el('name').addEventListener('input', function () {
  el('toolName').textContent = toolNameFor(el('name').value) || '-';
});
el('addStep').addEventListener('click', function () { el('steps').appendChild(stepRow(null)); renumber(); });
el('new').addEventListener('click', function () { openEditor(null); });
el('cancel').addEventListener('click', closeEditor);

el('save').addEventListener('click', function () {
  var steps = [];
  var problem = null;

  Array.prototype.forEach.call(el('steps').children, function (row, index) {
    var text = row.querySelector('input').value.trim() || '{}';
    try {
      steps.push({ tool: row.querySelector('select').value, args: JSON.parse(text) });
    } catch (error) {
      problem = 'Step ' + (index + 1) + ' has arguments that are not valid JSON.';
    }
  });

  if (problem) { note('editorNote', 'err', problem); return; }
  if (!steps.length) { note('editorNote', 'err', 'A shortcut needs at least one step.'); return; }

  var body = {
    name: el('name').value,
    description: el('description').value,
    reply: el('reply').value,
    enabled: editing ? editing.enabled : true,
    steps: steps
  };

  busy(el('save'), true, 'Saving...');
  var request = editing
    ? api('PUT', '/console/api/shortcuts/' + encodeURIComponent(editing.name), body)
    : api('POST', '/console/api/shortcuts', body);

  request
    .then(function () { closeEditor(); return load(); })
    .catch(function (error) { note('editorNote', 'err', error.message); })
    .then(function () { busy(el('save'), false); });
});

function render(shortcuts) {
  var list = el('shortcuts');
  list.innerHTML = '';
  if (!shortcuts.length) { list.innerHTML = EMPTY_HTML; return; }

  shortcuts.forEach(function (shortcut) {
    var card = make('div', 'card item');
    var main = make('div', 'main');
    main.appendChild(make('h3', null, shortcut.name));
    main.appendChild(make('p', 'soft', shortcut.description || 'No description'));

    var chips = make('div', 'chips');
    chips.appendChild(make('span', 'chip', shortcut.toolName));
    chips.appendChild(make('span', 'muted', 'runs'));
    shortcut.steps.forEach(function (step, index) {
      if (index > 0) chips.appendChild(make('span', 'muted', '→'));
      chips.appendChild(make('span', 'chip', step.tool));
    });
    main.appendChild(chips);
    card.appendChild(main);

    var actions = make('div', 'actions');
    var edit = make('button', 'small', 'Edit');
    edit.addEventListener('click', function () { openEditor(shortcut); });
    actions.appendChild(edit);

    var remove = make('button', 'small danger', 'Remove');
    remove.addEventListener('click', function () {
      if (!window.confirm('Remove the ' + shortcut.name + ' shortcut?')) return;
      busy(remove, true, '...');
      api('DELETE', '/console/api/shortcuts/' + encodeURIComponent(shortcut.name))
        .then(load)
        .catch(function (error) { busy(remove, false); window.alert(error.message); });
    });
    actions.appendChild(remove);

    card.appendChild(actions);
    list.appendChild(card);
  });
}

function load() {
  return Promise.all([api('GET', '/console/api/tools'), api('GET', '/console/api/shortcuts')])
    .then(function (results) {
      tools = results[0].tools;
      render(results[1].shortcuts);
    })
    .catch(function (error) { note('editorNote', 'err', error.message); });
}

load();
`;
