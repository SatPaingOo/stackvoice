import { renderPage } from '../web/layout.js';
import { CONSOLE_CLIENT, CONSOLE_CSS } from './client.js';

/**
 * The settings route.
 *
 * Some settings take effect only on the next start — the port the server is
 * bound to, the auth mode, which pages are mounted. The page says so next to
 * each of those rather than letting a saved change look live when it is not.
 */
export function renderSettingsPage(): string {
  return renderPage({
    title: 'Settings — StackVoice',
    nav: 'settings',
    css: CONSOLE_CSS + SETTINGS_CSS,
    body: `
<main class="shell page">
  <div class="page-head">
    <h1>Settings</h1>
    <p>How this server runs and who may reach it. Changes are written to
      <code>config/settings.yml</code>, with the previous version kept in <code>config/backups</code>.</p>
  </div>

  <section class="card" style="margin-bottom:18px">
    <h2>Connect an assistant</h2>
    <p class="soft" style="margin:6px 0 16px">Point any MCP client at this address.</p>
    <div class="endpoint">
      <code id="mcpUrl">…</code>
      <button class="small" id="copy">Copy</button>
    </div>
    <p class="muted" style="font-size:13.5px;margin:12px 0 0">Streamable HTTP · MCP spec 2025-11-25</p>
  </section>

  <form id="form" autocomplete="off">
    <section class="card" style="margin-bottom:18px">
      <h2>Access</h2>
      <p class="soft" style="margin:6px 0 16px">Anyone who can reach this server can ask it questions unless you turn this on.</p>

      <div class="choices" id="modes">
        <label class="choice"><input type="radio" name="mode" value="none">
          <span><b>Open</b><small>No check at all. Only safe while the server listens on localhost.</small></span></label>
        <label class="choice"><input type="radio" name="mode" value="token">
          <span><b>Shared token</b><small>One secret on every request. Enough behind a private tunnel.</small></span></label>
        <label class="choice"><input type="radio" name="mode" value="oauth">
          <span><b>OAuth 2.1</b><small>Full sign-in with PKCE. What Alexa+ requires.</small></span></label>
      </div>

      <div class="two" style="margin-top:18px">
        <div class="field">
          <label for="token">Owner token <span class="hint" id="tokenState"></span></label>
          <input id="token" type="password" placeholder="leave empty to keep the current one">
        </div>
        <div class="field">
          <label for="publicUrl">Public address <span class="hint">— needed for OAuth</span></label>
          <input id="publicUrl" type="text" placeholder="https://stackvoice.example.com">
        </div>
      </div>
      <p class="restart">Takes effect when the server restarts.</p>
    </section>

    <section class="card" style="margin-bottom:18px">
      <h2>Pages</h2>
      <p class="soft" style="margin:6px 0 16px">Turn off what you do not use.</p>
      <div class="stack">
        <label class="switch"><input type="checkbox" id="console"> Console — this page, and adding apps in a browser</label>
        <label class="switch"><input type="checkbox" id="simulator"> Simulator — the voice demo at /simulator</label>
      </div>
      <p class="restart">Takes effect when the server restarts.</p>
    </section>

    <section class="card" style="margin-bottom:18px">
      <h2>Server</h2>
      <div class="two" style="margin-top:14px">
        <div class="field">
          <label for="host">Listen on</label>
          <input id="host" type="text">
        </div>
        <div class="field">
          <label for="port">Port</label>
          <input id="port" type="number" min="1" max="65535">
        </div>
      </div>
      <div class="two" style="margin-top:16px">
        <div class="field">
          <label for="ttl">Cache <span class="hint">— seconds before data is fetched again</span></label>
          <input id="ttl" type="number" min="0" max="86400">
        </div>
        <div class="field">
          <label for="logLevel">Log detail</label>
          <select id="logLevel">
            <option value="error">errors only</option>
            <option value="warn">warnings</option>
            <option value="info">normal</option>
            <option value="debug">everything</option>
          </select>
        </div>
      </div>
      <p class="restart">Takes effect when the server restarts.</p>
    </section>

    <div id="formNote"></div>
    <div class="row" style="margin-top:6px">
      <button class="primary" id="save" type="submit">Save settings</button>
    </div>
  </form>
</main>`,
    script: CONSOLE_CLIENT + SETTINGS_SCRIPT,
  });
}

const SETTINGS_CSS = `
  .endpoint { display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
              background: var(--bg-alt); border: 1px solid var(--line-soft); border-radius: var(--radius-sm);
              padding: 10px 12px; }
  .endpoint code { background: none; padding: 0; font-size: 14.5px; flex: 1; min-width: 0; overflow-wrap: anywhere; }

  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .choice { display: flex; gap: 10px; align-items: flex-start; margin: 0; cursor: pointer;
            border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 13px 14px;
            transition: border-color .15s, background .15s; }
  .choice:hover { border-color: var(--accent); }
  .choice input { width: auto; margin-top: 3px; accent-color: var(--accent); }
  .choice b { display: block; color: var(--ink); font-size: 15px; font-weight: 600; }
  .choice small { display: block; color: var(--muted); font-size: 13px; line-height: 1.45; margin-top: 3px; font-weight: 400; }
  .choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }

  .restart { font-size: 13px; color: var(--muted); margin: 16px 0 0; display: flex; gap: 6px; align-items: center; }
  .restart::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }

  section.card h2 { font-size: 18px; }

  @media (max-width: 760px) { .choices { grid-template-columns: 1fr; } }
`;

const SETTINGS_SCRIPT = `
function fill(data) {
  var s = data.settings;
  el('mcpUrl').textContent = data.endpoints.mcp;

  Array.prototype.forEach.call(document.querySelectorAll('input[name=mode]'), function (radio) {
    radio.checked = radio.value === s.auth.mode;
  });
  el('tokenState').textContent = s.auth.tokenSet ? '— one is set' : '— none set';
  el('token').value = '';
  el('publicUrl').value = s.auth.publicUrl;
  el('console').checked = s.console.enabled;
  el('simulator').checked = s.simulator.enabled;
  el('host').value = s.server.host;
  el('port').value = s.server.port;
  el('ttl').value = s.cache.ttlSeconds;
  el('logLevel').value = s.server.logLevel;
}

el('copy').addEventListener('click', function () {
  var text = el('mcpUrl').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  el('copy').textContent = 'Copied';
  setTimeout(function () { el('copy').textContent = 'Copy'; }, 1400);
});

el('form').addEventListener('submit', function (event) {
  event.preventDefault();
  var mode = document.querySelector('input[name=mode]:checked');

  var body = {
    server: { host: el('host').value.trim(), port: Number(el('port').value), logLevel: el('logLevel').value },
    auth: { mode: mode ? mode.value : 'none', token: el('token').value, publicUrl: el('publicUrl').value.trim() },
    console: { enabled: el('console').checked },
    simulator: { enabled: el('simulator').checked },
    cache: { ttlSeconds: Number(el('ttl').value) }
  };

  busy(el('save'), true, 'Saving...');
  api('PUT', '/console/api/settings', body)
    .then(function (data) {
      fill(data);
      note('formNote', data.restartRequired ? 'warn' : 'ok',
        data.restartRequired
          ? 'Saved. Restart the server for these changes to take effect.'
          : 'Saved.');
    })
    .catch(function (error) { note('formNote', 'err', error.message); })
    .then(function () { busy(el('save'), false); });
});

api('GET', '/console/api/settings')
  .then(fill)
  .catch(function (error) { note('formNote', 'err', error.message); });
`;
