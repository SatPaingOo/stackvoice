import { COMPONENTS_CSS } from '../web/components-css.js';
import { renderPage } from '../web/layout.js';
import { CONSOLE_CSS } from './console-css.js';

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
    css: CONSOLE_CSS + COMPONENTS_CSS + SETTINGS_CSS,
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
      <h2>Data sources</h2>
      <p class="soft" style="margin:6px 0 16px">Where links and files can be read from.</p>
      <label class="switch"><input type="checkbox" id="privateNet"> Let links reach this computer and your home network</label>
      <p class="muted" style="font-size:13.5px;margin:6px 0 0 30px">For a service running next to StackVoice, such as a
        home server. Leave it off on a server the internet can reach.</p>
      <div class="field" style="margin-top:16px">
        <label for="dataDir">Data folder <span class="hint">— file sources are read from here and nowhere else</span></label>
        <input id="dataDir" type="text" placeholder="data" spellcheck="false">
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

  <section class="card" style="margin-top:18px">
    <div class="row">
      <h2 class="grow">Saved keys</h2>
      <button class="small" id="addKey" type="button">Add a key</button>
    </div>
    <p class="soft" style="margin:6px 0 16px">API keys your apps send. Kept in <code>config/secrets.yml</code> on this
      server. A saved value is never shown again, here or anywhere else.</p>
    <div id="keysNote"></div>
    <div id="keys" class="keys"></div>
  </section>
</main>`,
    modules: ['settings/settings-page.js'],
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

  .keys { display: grid; gap: 8px; }
  .keys > p { margin: 0; font-size: 14px; }
  .key-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 9px 12px;
             border: 1px solid var(--line-soft); border-radius: var(--radius-sm); }
  .key-row .used { flex: 1; min-width: 0; font-size: 13.5px; color: var(--muted); }

  @media (max-width: 760px) { .choices { grid-template-columns: 1fr; } }
`;
