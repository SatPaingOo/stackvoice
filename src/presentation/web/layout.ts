import { LOGO_SVG, THEME_CSS } from './theme.js';

export type NavKey = 'home' | 'apps' | 'shortcuts' | 'settings' | 'simulator';

export interface PageOptions {
  readonly title: string;
  readonly nav: NavKey | null;
  /** Extra CSS for this page only. */
  readonly css?: string;
  /** Body markup, inside the shell. */
  readonly body: string;
  /** Page script, run after the markup is parsed. */
  readonly script?: string;
  /** Compiled client modules under /assets, such as `apps/apps-page.js`. */
  readonly modules?: readonly string[];
  /** Landing pages own their whole viewport and skip the app chrome. */
  readonly chrome?: boolean;
}

/** Where the compiled client modules are served. */
export const ASSETS_PATH = '/assets';

const NAV_ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: 'apps', href: '/console', label: 'Apps' },
  { key: 'shortcuts', href: '/console/shortcuts', label: 'Shortcuts' },
  { key: 'settings', href: '/console/settings', label: 'Settings' },
  { key: 'simulator', href: '/simulator', label: 'Try it' },
];

/**
 * Wraps page markup in the shared shell.
 *
 * Real routes rather than a client-side router: a self-hosted tool with no build
 * step should be linkable, bookmarkable and reloadable, and the server already
 * knows how to render HTML.
 */
export function renderPage(options: PageOptions): string {
  const chrome = options.chrome !== false;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.classList.add('js')</script>
<title>${escapeHtml(options.title)}</title>
<meta name="description" content="Ask your own stuff, not the internet. A self-hosted MCP server that turns your data projects into tools your assistant can call.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(faviconSvg())}">
<style>${THEME_CSS}${options.css ?? ''}</style>
</head>
<body>
${chrome ? topbar(options.nav) : ''}
${options.body}
${chrome ? footer() : ''}
<script>${REVEAL_SCRIPT}${options.script ?? ''}</script>
${(options.modules ?? []).map((path) => `<script type="module" src="${ASSETS_PATH}/${escapeHtml(path)}"></script>`).join('\n')}
</body>
</html>`;
}

function topbar(active: NavKey | null): string {
  const links = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}"${item.key === active ? ' class="on" aria-current="page"' : ''}>${item.label}</a>`,
  ).join('');

  return `<header class="topbar">
  <div class="shell inner">
    <a class="brand" href="/" aria-label="StackVoice home">${LOGO_SVG}<span class="word">StackVoice</span></a>
    <span class="grow"></span>
    <nav class="nav">${links}</nav>
  </div>
</header>`;
}

function footer(): string {
  return `<footer class="site">
  <div class="shell inner">
    <span>StackVoice</span>
    <span class="grow"></span>
    <a href="/healthz">Server health</a>
    <a href="https://github.com/SatPaingOo/stackvoice">Source</a>
  </div>
</footer>`;
}

function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#c96442"/><g fill="#fff"><rect x="4.5" y="5.5" width="15" height="3.4" rx="1.7" opacity=".45"/><rect x="4.5" y="10.3" width="15" height="3.4" rx="1.7" opacity=".72"/><rect x="4.5" y="15.1" width="15" height="3.4" rx="1.7"/></g></svg>`;
}

/** Reveals sections as they scroll in. Silently does nothing where unsupported. */
const REVEAL_SCRIPT = `
(function () {
  var pending = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!pending.length) return;

  function show(node) { node.classList.add('seen'); }

  // The observer is the smooth path. The position check is the safety net: it
  // runs on load and on scroll, so a section cannot stay hidden just because
  // the observer is unsupported, slow, or never reports.
  function sweep() {
    var limit = window.innerHeight * 0.92;
    pending = pending.filter(function (node) {
      if (node.getBoundingClientRect().top < limit) { show(node); return false; }
      return true;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', sweep);
      window.removeEventListener('resize', sweep);
    }
  }

  if ('IntersectionObserver' in window) {
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        show(entry.target);
        watcher.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    pending.forEach(function (node) { watcher.observe(node); });
  }

  window.addEventListener('scroll', sweep, { passive: true });
  window.addEventListener('resize', sweep);
  sweep();
})();
`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
