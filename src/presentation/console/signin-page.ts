import { renderPage } from '../web/layout.js';
import { CONSOLE_CLIENT } from './client.js';

/** The one screen shown when the console needs a token and has none. */
export function renderSigninPage(): string {
  return renderPage({
    title: 'Sign in — StackVoice',
    nav: null,
    css: `
      .signin { min-height: calc(100vh - 62px - 76px); display: grid; place-items: center; padding: 40px 0; }
      .signin .card { width: min(420px, 100%); padding: 30px; }
      .signin h1 { font-size: 24px; }
      .signin p { margin: 8px 0 22px; }
    `,
    body: `
<main class="shell signin">
  <form class="card rise" id="form">
    <h1>Sign in</h1>
    <p class="soft">Enter the owner token from your own <code>config/settings.yml</code>.</p>
    <div class="field">
      <label for="token">Owner token</label>
      <input id="token" type="password" autocomplete="current-password" autofocus required>
    </div>
    <div id="formNote"></div>
    <button class="primary" id="go" type="submit" style="margin-top:18px;width:100%;justify-content:center">Sign in</button>
  </form>
</main>`,
    script:
      CONSOLE_CLIENT +
      `
el('form').addEventListener('submit', function (event) {
  event.preventDefault();
  busy(el('go'), true, 'Signing in...');
  fetch('/console/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: el('token').value })
  })
    .then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'That did not work.');
        var next = new URLSearchParams(window.location.search).get('next');
        // Only follow a path on this server, never an absolute URL from the query string.
        window.location.href = next && next.charAt(0) === '/' && next.charAt(1) !== '/' ? next : '/console';
      });
    })
    .catch(function (error) { note('formNote', 'err', error.message); busy(el('go'), false); });
});
`,
  });
}
