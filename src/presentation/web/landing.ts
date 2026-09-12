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
 * page shows that rather than asserting it: any kind of source flows into the
 * server, the tools type themselves out of one pasted link, and the numbers are
 * read from the stack actually running behind the page.
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
      Your assistant can search the whole web, yet it cannot tell you what is in your own
      feeds, spreadsheets and data projects. StackVoice turns them into tools it can call,
      running on your own server.
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
    <h2>Paste a link. Get tools.</h2>
    <p class="soft">Paste a feed, an API, a spreadsheet link, a GitHub repository or a file name.
      StackVoice works out which field is the title, the summary and the date, shows every guess
      with an example from your data, and lets you pick a different column for any of them.
      No code, no schema to learn.</p>
    ${configDemo()}
  </section>

  <section class="shell reveal">
    <div class="grid3">
      ${feature(
        'Any source you have',
        'News feeds, JSON APIs, published spreadsheets, GitHub repositories and files on your server. Paste it once and it is a tool.',
        '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
      )}
      ${feature(
        'You fix the guesses',
        'Every field shows an example from your own data. Click a column to change it, or combine two, like {Date}: {Price}.',
        '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
      )}
      ${feature(
        'Keys stay on your server',
        'An API key is saved on the server and referenced by name. It is never written into an app file and never shown again.',
        '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
      )}
      ${feature(
        'It speaks, not dumps',
        'A speaker cannot read a JSON array aloud. Every answer comes back as two sentences a person can listen to.',
        '<path d="M12 3v18M7 8v8M17 8v8M2.5 11v2M21.5 11v2"/>',
      )}
      ${feature(
        'Yours, on your machine',
        'Runs on your own box behind your own OAuth. Nothing is uploaded or indexed; the assistant only sees the answers it asks for.',
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
        <li><span>2</span> Check the guesses. Click a different column for anything that looks wrong.</li>
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

/** The whole idea in one picture: whatever you have, this server, the assistant. */
function pipeline(): string {
  return `<div class="pipe card">
  <svg viewBox="0 0 900 240" role="img" aria-label="Feeds, APIs, spreadsheets, repositories and files flow into StackVoice, which an assistant calls over MCP.">
    <defs>
      <linearGradient id="wire" x1="0" x2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity=".55"/>
      </linearGradient>
    </defs>

    <path class="wire" d="M214 31 C 292 31, 288 120, 360 120" stroke="url(#wire)" stroke-width="2" fill="none"/>
    <circle class="spark" r="4" fill="var(--accent)"><animateMotion dur="2.6s" begin="0.00s" repeatCount="indefinite" path="M214 31 C 292 31, 288 120, 360 120"/></circle>
    <path class="wire" d="M214 75 C 292 75, 288 120, 360 120" stroke="url(#wire)" stroke-width="2" fill="none"/>
    <circle class="spark" r="4" fill="var(--accent)"><animateMotion dur="2.6s" begin="0.52s" repeatCount="indefinite" path="M214 75 C 292 75, 288 120, 360 120"/></circle>
    <path class="wire" d="M214 119 C 292 119, 288 120, 360 120" stroke="url(#wire)" stroke-width="2" fill="none"/>
    <circle class="spark" r="4" fill="var(--accent)"><animateMotion dur="2.6s" begin="1.04s" repeatCount="indefinite" path="M214 119 C 292 119, 288 120, 360 120"/></circle>
    <path class="wire" d="M214 163 C 292 163, 288 120, 360 120" stroke="url(#wire)" stroke-width="2" fill="none"/>
    <circle class="spark" r="4" fill="var(--accent)"><animateMotion dur="2.6s" begin="1.56s" repeatCount="indefinite" path="M214 163 C 292 163, 288 120, 360 120"/></circle>
    <path class="wire" d="M214 207 C 292 207, 288 120, 360 120" stroke="url(#wire)" stroke-width="2" fill="none"/>
    <circle class="spark" r="4" fill="var(--accent)"><animateMotion dur="2.6s" begin="2.08s" repeatCount="indefinite" path="M214 207 C 292 207, 288 120, 360 120"/></circle>
    <path class="wire" d="M540 120 H688" stroke="url(#wire)" stroke-width="2.5" fill="none"/>
    <circle class="spark" r="4.5" fill="var(--accent)"><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite" path="M540 120 H688"/></circle>

    <g class="src"><rect x="24" y="14" width="190" height="34" rx="17"/><text x="119" y="36">RSS &amp; Atom feeds</text></g>
    <g class="src"><rect x="24" y="58" width="190" height="34" rx="17"/><text x="119" y="80">JSON APIs</text></g>
    <g class="src"><rect x="24" y="102" width="190" height="34" rx="17"/><text x="119" y="124">Sheets &amp; CSV</text></g>
    <g class="src"><rect x="24" y="146" width="190" height="34" rx="17"/><text x="119" y="168">GitHub repos</text></g>
    <g class="src"><rect x="24" y="190" width="190" height="34" rx="17"/><text x="119" y="212">Files on your server</text></g>

    <g class="node accent">
      <rect x="360" y="55" width="180" height="130" rx="14"/>
      <text class="nt" x="450" y="95">StackVoice</text>
      <text class="ns" x="450" y="118">finds the records</text>
      <text class="ns" x="450" y="136">generates the tools</text>
      <text class="ns" x="450" y="154">speaks MCP</text>
    </g>

    <g class="node">
      <rect x="688" y="70" width="188" height="100" rx="14"/>
      <text class="nt" x="782" y="108">Your assistant</text>
      <text class="ns" x="782" y="131">asks in your words</text>
      <text class="ns" x="782" y="149">answers out loud</text>
    </g>
  </svg>
  <ol class="pipe-steps">
    <li><b>Your data</b><span>feeds, APIs, spreadsheets, repositories or files</span></li>
    <li class="accent"><b>StackVoice</b><span>finds the records, generates the tools, speaks MCP</span></li>
    <li><b>Your assistant</b><span>asks in your words, answers out loud</span></li>
  </ol>
  <p class="pipe-note soft">Your records stay on your server. The assistant receives only the answers it asks for, and an API key is sent only to the service it belongs to.</p>
</div>`;
}

/** One pasted link on the left, the tools it becomes typing themselves out on the right. */
function configDemo(): string {
  return `<div class="demo">
  <div class="demo-form" aria-label="The add form in the console">
    <div class="demo-label">Where is the data?</div>
    <div class="demo-input">https://feeds.bbci.co.uk/news/world/rss.xml</div>
    <div class="demo-found"><span class="demo-tag">RSS feed</span> Records found. Check the guesses:</div>
    <div class="demo-map">
      <span>title</span><code>title</code>
      <span>summary</span><code>summary</code>
      <span>date</span><code>date</code>
      <span>link</span><code>link</code>
    </div>
  </div>
  <div class="demo-arrow" aria-hidden="true">→</div>
  <ul class="demo-tools" id="tools">
    <li data-tool="news_search">news_search<span>find stories by subject</span></li>
    <li data-tool="news_read">news_read<span>read one story in full</span></li>
    <li data-tool="news_status">news_status<span>is it healthy and fresh</span></li>
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
  .pipe .src rect { fill: var(--panel); stroke: var(--line); stroke-width: 1; }
  .pipe .src text { font: 500 13px var(--sans); fill: var(--ink-soft); text-anchor: middle; }
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
  .demo-form { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
               box-shadow: var(--shadow); padding: 18px 20px; min-width: 0; }
  .demo-label { font-size: 13px; font-weight: 500; color: var(--ink-soft); }
  .demo-input { margin-top: 6px; padding: 10px 12px; border: 1px solid var(--accent); border-radius: var(--radius-sm);
                box-shadow: 0 0 0 3px var(--accent-soft); font: 13px var(--mono); color: var(--ink);
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .demo-found { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 14px 0 10px;
                font-size: 13.5px; color: var(--ink-soft); }
  .demo-tag { font: 600 11px/1.6 var(--sans); letter-spacing: .04em; text-transform: uppercase;
              color: var(--accent-ink); background: var(--accent-soft); border-radius: 6px; padding: 1px 7px; }
  .demo-map { display: grid; grid-template-columns: 80px 1fr; gap: 7px 12px; font-size: 13.5px; align-items: center; }
  .demo-map span { color: var(--muted); }
  .demo-map code { justify-self: start; }
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

  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px 26px; margin-top: clamp(56px, 9vw, 96px); }
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
