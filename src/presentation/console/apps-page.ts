import { COMPONENTS_CSS } from '../web/components-css.js';
import { renderPage } from '../web/layout.js';
import { CONSOLE_CSS } from './console-css.js';

/**
 * The apps route. The server renders the frame; the list and the dialog that adds
 * and edits an app are client components, in web/client/apps.
 */
export function renderAppsPage(): string {
  return renderPage({
    title: 'Apps — StackVoice',
    nav: 'apps',
    css: CONSOLE_CSS + COMPONENTS_CSS,
    body: `
<main class="shell page">
  <div class="page-head row">
    <div class="grow">
      <h1>Your apps</h1>
      <p>Each one becomes a set of tools your assistant can call. Paste a news feed, an API,
        a spreadsheet link, a GitHub repository or a file, and StackVoice works out the rest.</p>
    </div>
    <button class="primary" id="new" type="button">Add an app</button>
  </div>
  <div id="listNote"></div>
  <div id="apps" class="list" aria-live="polite"></div>
</main>`,
    modules: ['apps/apps-page.js'],
  });
}
