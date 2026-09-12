import { MAX_SHORTCUT_STEPS } from '../../domain/shortcut.js';
import { COMPONENTS_CSS } from '../web/components-css.js';
import { renderPage } from '../web/layout.js';
import { CONSOLE_CSS } from './console-css.js';

/**
 * The shortcuts route: one tool that runs several. The list and the dialog that
 * adds and edits a shortcut are client components, in web/client/shortcuts.
 */
export function renderShortcutsPage(): string {
  return renderPage({
    title: 'Shortcuts — StackVoice',
    nav: 'shortcuts',
    css: CONSOLE_CSS + COMPONENTS_CSS,
    body: `
<main class="shell page">
  <div class="page-head row">
    <div class="grow">
      <h1>Shortcuts</h1>
      <p>One tool that runs several, so "what's my morning brief" is a single question.
        Name it the way you would say it out loud.</p>
    </div>
    <button class="primary" id="new" type="button">Add a shortcut</button>
  </div>
  <div id="listNote"></div>
  <div id="shortcuts" class="list" data-max-steps="${MAX_SHORTCUT_STEPS}" aria-live="polite"></div>
</main>`,
    modules: ['shortcuts/shortcuts-page.js'],
  });
}
