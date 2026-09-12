import { renderPage } from './layout.js';

export interface LandingStats {
  readonly appCount: number;
  readonly toolCount: number;
  readonly itemCount: number | null;
  readonly shortcutNames: readonly string[];
}

/**
 * The landing page.
 *
 * It has one job: make the idea land in ten seconds. The assistant you already
 * talk to cannot see your own data; this puts your data in its hands, and the
 * page shows that rather than asserting it — the pipeline animates, the tool
 * list types itself out of a config file, and the numbers are read from the
 * stack actually running behind the page.
 */
export function renderLandingPage(stats: LandingStats): string {
  return renderPage({
    title: 'StackVoice — ask your own stuff, not the internet',
    nav: 'home',
    // The landing page draws its own lighter header and footer.
    chrome: false,
    css: LANDING_CSS,
    body: body(stats),
    script: LANDING_SCRIPT,
  });
}

function body(stats: LandingStats): string {
  const shortcut = stats.shortcutNames[0] ?? 'morning brief';

  return `
<div class="glow" aria-hidden="true"></div>

<header class="topbar">
  <div class="shell inner">
    <a class="brand" href="/"><svg class="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="4.4" rx="2.2" fill="currentColor" opacity=".28"/>
      <rect x="2.5" y="9.8" width="19" height="4.4" rx="2.2" fill="currentColor" opacity=".58"/>
      <rect x="2.5" y="15.6" width="19" height="4.4" rx="2.2" fill="currentColor"/>
    </svg>StackVoice</a>
    <span class="grow"></span>
    <nav class="nav">
      <a href="/console">Console</a>
      <a href="/simulator">Try it</a>
    </nav>
  </div>
</header>

<main>
  <section class="hero shell">
    <span class="pill rise" style="animation-delay:.05s">Self-hosted · Model Context Protocol</span>
    <h1 class="rise" style="animation-delay:.12s">
      Ask your own stuff,<br><em>not the internet.</em>
    </h1>
    <p class="lede rise" style="animation-delay:.2s">
      Your assistant can search the whole web and still cannot tell you what your own
      nightly pipeline found last night. StackVoice turns your data projects into tools
      it can call — and your data never leaves your server.
    </p>
    <div class="row rise" style="animation-delay:.28s">
      <a class="btn primary" href="/simulator">Ask it something</a>
      <a class="btn" href="/console">Add your own data</a>
    </div>
    <p class="under rise" style="animation-delay:.36s">
      ${stats.appCount === 0 ? 'No apps configured yet.' : liveLine(stats)}
    </p>
  </section>

  <section class="shell reveal">
    ${pipeline()}
  </section>

  <section class="shell band reveal">
    <h2>Config in. Tools out.</h2>
    <p class="soft">Paste a feed, an API, a spreadsheet or a repository. It works out which field
      is the title and which is the date, and generates the tools. No code, no schema to learn.</p>
    ${configDemo()}
  </section>

  <section class="shell reveal">
    <div class="grid3">
      ${feature(
        'It speaks, not dumps',
        'A speaker cannot read a JSON array aloud. Every answer comes back as two sentences a person can listen to.',
        '<path d="M12 3v18M7 8v8M17 8v8M2.5 11v2M21.5 11v2"/>',
      )}
      ${feature(
        'Yours, on your machine',
        'Runs on your own box behind your own OAuth. Nothing is uploaded, nothing is indexed, no account is created.',
        '<path d="M12 3l7.5 3.4v5c0 4.4-3.1 8.3-7.5 9.6-4.4-1.3-7.5-5.2-7.5-9.6v-5z"/><path d="M9.2 12.2l2 2 3.6-3.9"/>',
      )}
      ${feature(
        'One question, several answers',
        `Ask for your ${escapeText(shortcut)} and it runs every step in order, then answers with all of it at once.`,
        '<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="18.5" cy="6" r="2"/><circle cx="13.5" cy="18" r="2"/>',
      )}
    </div>
  </section>

  <section class="shell reveal">
    <div class="cta">
      <h2>Two minutes to your own data</h2>
      <ol class="steps">
        <li><span>1</span> Open the console and paste a feed, an API, a spreadsheet link or a GitHub repository.</li>
        <li><span>2</span> Check what it inferred. Fix anything that looks wrong.</li>
        <li><span>3</span> Ask your assistant about it.</li>
      </ol>
      <div class="row">
        <a class="btn primary" href="/console">Open the console</a>
        <a class="btn" href="/simulator">Hear it first</a>
      </div>
    </div>
  </section>
</main>

<footer class="site">
  <div class="shell inner">
    <span>StackVoice · MIT</span>
    <span class="grow"></span>
    <a href="/console">Console</a>
    <a href="/simulator">Simulator</a>
    <a href="/healthz">Health</a>
  </div>
</footer>`;
}

function liveLine(stats: LandingStats): string {
  const items = stats.itemCount === null ? null : stats.itemCount.toLocaleString('en-US');
  const parts = [
    `<b>${stats.appCount}</b> app${stats.appCount === 1 ? '' : 's'} connected`,
    `<b>${stats.toolCount}</b> tool${stats.toolCount === 1 ? '' : 's'} live`,
  ];
  if (items !== null) parts.push(`<b>${items}</b> records reachable`);
  return `<span class="dot ok" style="display:inline-block;margin-right:7px"></span>${parts.join(' · ')}`;
}

/** The whole idea in one picture: your repo, this server, the assistant. */
function pipeline(): string {
  return `<div class="pipe card">
  <svg viewBox="0 0 900 190" role="img" aria-label="Your data project feeds StackVoice, which an assistant calls over MCP.">
    <defs>
      <linearGradient id="wire" x1="0" x2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity=".55"/>
      </linearGradient>
    </defs>

    <path class="wire" d="M212 95 H360" stroke="url(#wire)" stroke-width="2.5" fill="none"/>
    <path class="wire" d="M540 95 H688" stroke="url(#wire)" stroke-width="2.5" fill="none"/>
    <circle class="spark" r="4.5" fill="var(--accent)"><animateMotion dur="2.6s" repeatCount="indefinite" path="M212 95 H360"/></circle>
    <circle class="spark" r="4.5" fill="var(--accent)"><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite" path="M540 95 H688"/></circle>

    <g class="node">
      <rect x="24" y="45" width="188" height="100" rx="14"/>
      <text class="nt" x="118" y="83">Your pipeline</text>
      <text class="ns" x="118" y="106">GitHub Actions</text>
      <text class="ns" x="118" y="124">writes JSON nightly</text>
    </g>

    <g class="node accent">
      <rect x="360" y="30" width="180" height="130" rx="14"/>
      <text class="nt" x="450" y="70">StackVoice</text>
      <text class="ns" x="450" y="93">reads your config</text>
      <text class="ns" x="450" y="111">generates the tools</text>
      <text class="ns" x="450" y="129">speaks MCP</text>
    </g>

    <g class="node">
      <rect x="688" y="45" width="188" height="100" rx="14"/>
      <text class="nt" x="782" y="83">Your assistant</text>
      <text class="ns" x="782" y="106">asks in your words</text>
      <text class="ns" x="782" y="124">answers out loud</text>
    </g>
  </svg>
  <ol class="pipe-steps">
    <li><b>Your pipeline</b><span>GitHub Actions writes JSON nightly</span></li>
    <li class="accent"><b>StackVoice</b><span>reads your config, generates the tools, speaks MCP</span></li>
    <li><b>Your assistant</b><span>asks in your words, answers out loud</span></li>
  </ol>
  <p class="pipe-note soft">Your records never pass through anyone else. The assistant calls your server directly.</p>
</div>`;
}

/** A config file on the left, the tools it produces typing themselves on the right. */
function configDemo(): string {
  return `<div class="demo">
  <pre class="demo-config"><span class="k">id:</span> library
<span class="k">label:</span> "Deep-dive library"
<span class="k">primitives:</span>
  <span class="k">search:</span> true
  <span class="k">read:</span> true
  <span class="k">status:</span> true
<span class="k">sources:</span>
  - <span class="k">repo:</span> you/your-pipeline
    <span class="k">fields:</span>
      <span class="k">title:</span> title
      <span class="k">summary:</span> tldr</pre>
  <div class="demo-arrow" aria-hidden="true">→</div>
  <ul class="demo-tools" id="tools">
    <li data-tool="library_search">library_search<span>find entries by subject</span></li>
    <li data-tool="library_read">library_read<span>read one entry in full</span></li>
    <li data-tool="library_status">library_status<span>is it healthy and fresh</span></li>
  </ul>
</div>`;
}

function feature(title: string, text: string, path: string): string {
  return `<div class="feat">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>
  <h3>${title}</h3>
  <p class="soft">${text}</p>
</div>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const LANDING_CSS = `
  .glow {
    position: fixed; inset: -30% 0 auto 0; height: 70vh; pointer-events: none; z-index: 0;
    background: radial-gradient(50% 50% at 50% 40%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%);
    filter: blur(30px);
  }
  main { position: relative; z-index: 1; }

  .hero { padding: clamp(56px, 10vw, 110px) var(--gutter) clamp(40px, 6vw, 70px); text-align: center; }
  .hero h1 {
    font-family: var(--serif); font-weight: 400;
    font-size: clamp(38px, 7.4vw, 68px); line-height: 1.08; letter-spacing: -0.028em;
    margin: 20px 0 0;
  }
  .hero h1 em { font-style: italic; color: var(--accent-ink); }
  .hero .lede { max-width: 60ch; margin: 20px auto 0; font-size: clamp(16px, 1.6vw, 18.5px); color: var(--ink-soft); }
  .hero .row { justify-content: center; margin-top: 28px; }
  .hero .btn { padding: 12px 22px; font-size: 15.5px; }
  .hero .under { margin: 22px 0 0; font-size: 14px; color: var(--muted); }
  .hero .under b { color: var(--ink); font-weight: 650; }

  section { scroll-margin-top: 80px; }
  section.band { margin-top: clamp(56px, 9vw, 96px); }
  section.band h2, .cta h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(26px, 3.6vw, 36px); }
  section.band > p { max-width: 58ch; margin: 10px 0 26px; font-size: 16px; }

  .pipe { margin-top: clamp(28px, 5vw, 48px); padding: 26px 20px 16px; overflow-x: auto; }
  .pipe svg { width: 100%; min-width: 620px; height: auto; display: block; }
  .pipe .node rect { fill: var(--bg-alt); stroke: var(--line); stroke-width: 1; }
  .pipe .node.accent rect { fill: var(--accent-soft); stroke: color-mix(in srgb, var(--accent) 40%, transparent); }
  .pipe .nt { font: 600 15px var(--sans); fill: var(--ink); text-anchor: middle; }
  .pipe .ns { font: 12.5px var(--sans); fill: var(--muted); text-anchor: middle; }
  .pipe-note { text-align: center; font-size: 13.5px; margin: 14px 0 4px; }

  /* The wide diagram becomes unreadable once it is squeezed onto a phone, so a
     stacked version with the same three stops takes its place. */
  .pipe-steps { display: none; list-style: none; margin: 0; padding: 0; }
  @media (max-width: 640px) {
    .pipe { padding: 18px 16px 12px; }
    .pipe svg { display: none; }
    .pipe-steps { display: grid; gap: 22px; }
    .pipe-steps li { position: relative; background: var(--bg-alt); border: 1px solid var(--line);
                     border-radius: var(--radius-sm); padding: 13px 15px; text-align: center; }
    .pipe-steps li.accent { background: var(--accent-soft);
                            border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
    .pipe-steps b { display: block; font-size: 15px; }
    .pipe-steps span { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
    .pipe-steps li + li::before { content: '↓'; position: absolute; top: -20px; left: 50%;
                                  transform: translateX(-50%); color: var(--accent); font-size: 15px; }
  }

  .demo { display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; }
  .demo-config {
    margin: 0; padding: 20px; border-radius: var(--radius); overflow-x: auto;
    background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow);
    font: 13px/1.75 var(--mono); color: var(--ink-soft);
  }
  .demo-config .k { color: var(--accent-ink); }
  .demo-arrow { font-size: 26px; color: var(--muted); }
  .demo-tools { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .demo-tools li {
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 13px 16px; font: 14px var(--mono); color: var(--ink);
    transition: opacity .5s, transform .5s;
  }
  /* Same rule as the section reveal: only hide what script will bring back. */
  html.js .demo-tools li { opacity: 0; transform: translateX(-10px); }
  html.js .demo-tools li.in { opacity: 1; transform: none; }
  .demo-tools li span { display: block; font: 13px var(--sans); color: var(--muted); margin-top: 3px; }

  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: clamp(56px, 9vw, 96px); }
  .feat svg { width: 26px; height: 26px; color: var(--accent); }
  .feat h3 { font-size: 17px; margin: 12px 0 6px; }
  .feat p { margin: 0; font-size: 15px; }

  .cta {
    margin-top: clamp(56px, 9vw, 96px); text-align: center;
    background: var(--bg-alt); border: 1px solid var(--line-soft);
    border-radius: 22px; padding: clamp(34px, 6vw, 56px) var(--gutter);
  }
  .cta .steps { list-style: none; margin: 26px auto; padding: 0; max-width: 480px; text-align: left; display: grid; gap: 12px; }
  .cta .steps li { display: flex; gap: 12px; align-items: baseline; color: var(--ink-soft); font-size: 15.5px; }
  .cta .steps span {
    flex: none; width: 23px; height: 23px; border-radius: 50%;
    background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .cta .row { justify-content: center; }

  @media (max-width: 860px) {
    .grid3 { grid-template-columns: 1fr; gap: 26px; }
    .demo { grid-template-columns: 1fr; }
    .demo-arrow { transform: rotate(90deg); justify-self: center; }
  }
`;

const LANDING_SCRIPT = `
(function () {
  var list = document.getElementById('tools');
  if (!list) return;
  var played = false;

  function play() {
    if (played) return;
    played = true;
    Array.prototype.forEach.call(list.children, function (node, index) {
      setTimeout(function () { node.classList.add('in'); }, 180 * index + 120);
    });
    window.removeEventListener('scroll', check);
  }

  // Position check as a fallback, for the same reason as the section reveal.
  function check() {
    if (list.getBoundingClientRect().top < window.innerHeight * 0.85) play();
  }

  if ('IntersectionObserver' in window) {
    var watcher = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        play();
        watcher.disconnect();
      }
    }, { threshold: .35 });
    watcher.observe(list);
  }

  window.addEventListener('scroll', check, { passive: true });
  check();
})();
`;
