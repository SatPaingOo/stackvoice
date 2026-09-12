import { MAX_FLOW_ASKS, MAX_FLOW_BLOCKS, MAX_FLOW_DEPTH, MAX_TRIGGERS } from '../../domain/flow.js';
import { COMPONENTS_CSS } from '../web/components-css.js';
import { renderPage } from '../web/layout.js';
import { CONSOLE_CSS } from './console-css.js';

/**
 * The shortcuts route. The list and the builder that adds and edits a shortcut,
 * block by block, are client components in web/client/shortcuts. The limits the
 * builder shows come from the domain, through the page, so the two never differ.
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
      <p>One tool that runs a flow of blocks, like a shortcut on your phone. Say it in your own
        words, and leave a slot the person fills in, such as news about {topic}.</p>
    </div>
    <button class="primary" id="new" type="button">Add a shortcut</button>
  </div>
  <div id="listNote"></div>
  <div id="shortcuts" class="list" aria-live="polite"
    data-max-triggers="${MAX_TRIGGERS}" data-max-blocks="${MAX_FLOW_BLOCKS}"
    data-max-asks="${MAX_FLOW_ASKS}" data-max-depth="${MAX_FLOW_DEPTH}"></div>
</main>`,
    modules: ['shortcuts/shortcuts-page.js'],
  });
}
