import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * The one screen a human sees.
 *
 * A self-hosted server has no user database, so consent is the owner proving
 * they are the owner. The form posts every original authorization parameter
 * straight back to `/authorize`, so the OAuth flow continues untouched: this
 * page adds a step, it does not alter the protocol.
 */
export function renderConsentPage(
  client: OAuthClientInformationFull,
  query: unknown,
  retried: boolean,
): string {
  const name = escapeHtml(client.client_name ?? client.client_id);
  const hidden = hiddenFields(query);
  const error = retried
    ? '<p class="error">That token did not match. Check <code>auth.token</code> in config/settings.yml.</p>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Approve access - StackVoice</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f6f6f5; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #1a1a19; color: #f0f0ef; } .card { background: #262625 !important; border-color: #3a3a38 !important; } input { background: #1a1a19 !important; color: inherit !important; border-color: #3a3a38 !important; } }
  .card { background: #fff; border: 1px solid #e3e3e0; border-radius: 12px; padding: 32px; width: min(420px, 90vw); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 16px; }
  .who { font-weight: 600; }
  label { display: block; font-size: 14px; margin-bottom: 6px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d0d0cc; border-radius: 8px; font: inherit; }
  button { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #c96442; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .error { color: #b5372a; font-size: 14px; }
  .foot { font-size: 13px; opacity: .7; margin: 16px 0 0; }
</style>
</head>
<body>
  <form class="card" method="post" action="/authorize">
    <h1>Approve access to your stack</h1>
    <p><span class="who">${name}</span> is asking to read the apps you configured in StackVoice. It cannot write to them.</p>
    ${error}
    <label for="owner_token">Owner token</label>
    <input id="owner_token" name="owner_token" type="password" autocomplete="off" autofocus required>
    ${hidden}
    <button type="submit">Approve</button>
    <p class="foot">This is the <code>auth.token</code> value from your own config/settings.yml. Your data never leaves this server.</p>
  </form>
</body>
</html>`;
}

/** Carries the original OAuth parameters through the consent POST untouched. */
function hiddenFields(query: unknown): string {
  if (query === null || typeof query !== 'object') return '';

  return Object.entries(query as Record<string, unknown>)
    .filter(([key, value]) => key !== 'owner_token' && typeof value === 'string')
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value as string)}">`,
    )
    .join('\n    ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
