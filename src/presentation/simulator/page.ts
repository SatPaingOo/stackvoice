import { escapeHtml, renderPage } from '../web/layout.js';

export interface SimulatorAppSummary {
  readonly id: string;
  readonly label: string;
  readonly searchable: boolean;
}

/**
 * The simulator: a simulated Alexa+ client that talks to this server over MCP.
 *
 * Speech in and out come from the browser's own Web Speech API, so the $0 budget
 * holds and no audio leaves the machine. Every answer shows the tool call that
 * produced it, because the point of the demo is the mechanism, not the magic.
 */
export function renderSimulatorPage(
  apps: readonly SimulatorAppSummary[],
  shortcutNames: readonly string[] = [],
): string {
  const suggestions = buildSuggestions(apps, shortcutNames);

  return renderPage({
    title: 'Try it — StackVoice',
    nav: 'simulator',
    css: SIMULATOR_CSS,
    body: `
<main class="shell sim">
  <section class="stage" id="stage">
    <div class="orb" id="orb" aria-hidden="true"><span></span><span></span><span></span></div>
    <h1 id="headline">Ask your stack</h1>
    <p class="soft" id="subline">${
      apps.length === 0
        ? 'No apps are connected yet. <a href="/console">Add one</a> first.'
        : `Connected to ${apps.map((app) => escapeHtml(app.label)).join(', ')}.`
    }</p>
    <div class="chips-row" id="chips">
      ${suggestions.map((text) => `<button class="suggest" type="button">${escapeHtml(text)}</button>`).join('')}
    </div>
  </section>

  <section id="log" class="log" aria-live="polite"></section>
</main>

<div class="dock">
  <form class="shell dock-inner" id="form">
    <button type="button" class="mic" id="mic" aria-pressed="false" title="Speak">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>
      </svg>
    </button>
    <input id="say" type="text" placeholder="Ask about your stack…" autocomplete="off">
    <button class="primary" id="go" type="submit">Ask</button>
  </form>
  <p class="shell dock-hint" id="hint"></p>
</div>`,
    script: SIMULATOR_SCRIPT,
  });
}

/** Prompts drawn from what is configured, so the demo works for any stack. */
function buildSuggestions(apps: readonly SimulatorAppSummary[], shortcutNames: readonly string[]): string[] {
  const suggestions = ['Is my stack healthy?'];
  const searchable = apps.filter((app) => app.searchable);

  if (searchable[0] !== undefined) {
    suggestions.push(`What did you find about AI in my ${searchable[0].label.toLowerCase()}?`);
  }
  if (shortcutNames[0] !== undefined) {
    suggestions.push(`What's my ${shortcutNames[0]}?`);
  }
  if (searchable[1] !== undefined) {
    suggestions.push(`Anything on Iran in my ${searchable[1].label.toLowerCase()}?`);
  }
  suggestions.push('Tell me more');
  return suggestions;
}

const SIMULATOR_CSS = `
  body { padding-bottom: 150px; }
  footer.site { display: none; }

  .sim { padding-top: clamp(24px, 6vh, 64px); }

  .stage { text-align: center; padding-bottom: 12px; }
  .stage h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(30px, 5vw, 46px);
              margin-top: 22px; letter-spacing: -0.02em; transition: font-size .4s ease, margin .4s ease; }
  .stage.compact h1 { font-size: 22px; margin-top: 10px; }
  .stage > p { margin: 10px auto 0; max-width: 56ch; }
  .stage.compact > p { display: none; }

  .orb { position: relative; width: 92px; height: 92px; margin: 0 auto; transition: transform .4s ease; }
  .stage.compact .orb { transform: scale(.55); margin: -14px auto -14px; }
  .orb span { position: absolute; inset: 0; border-radius: 50%;
              background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 70%, #fff), var(--accent)); }
  .orb span:nth-child(2), .orb span:nth-child(3) { background: var(--accent); opacity: 0; }
  .orb span:first-child { animation: breathe 4s ease-in-out infinite; }
  .orb.listening span:nth-child(2) { animation: ring 1.6s ease-out infinite; }
  .orb.listening span:nth-child(3) { animation: ring 1.6s ease-out .8s infinite; }
  .orb.thinking span:first-child { animation: breathe 1s ease-in-out infinite; }
  @keyframes ring { from { transform: scale(1); opacity: .45; } to { transform: scale(1.9); opacity: 0; } }
  @keyframes breathe { 50% { transform: scale(.92); opacity: .8; } }

  .chips-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 26px; }
  .stage.compact .chips-row { margin-top: 12px; }
  .suggest { font-size: 14px; padding: 8px 14px; border-radius: 999px; background: var(--panel); }

  .log { max-width: 760px; margin: 26px auto 0; display: flex; flex-direction: column; gap: 16px; }
  .turn { display: flex; flex-direction: column; gap: 7px; animation: rise .35s ease both; }
  .turn.user { align-items: flex-end; }
  .bubble { max-width: min(88%, 620px); padding: 12px 16px; border-radius: 18px; font-size: 15.5px; line-height: 1.55; }
  .user .bubble { background: var(--ink); color: var(--bg); border-bottom-right-radius: 6px; }
  .bot .bubble { background: var(--panel); border: 1px solid var(--line); border-bottom-left-radius: 6px; box-shadow: var(--shadow); }
  .bot .bubble.thinking { color: var(--muted); }
  .trace { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-left: 6px;
           font: 12.5px var(--mono); color: var(--muted); }
  .trace b { color: var(--ink-soft); font-weight: 600; }
  .trace.err .dot { background: var(--bad); }

  .dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
          background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(12px);
          border-top: 1px solid var(--line-soft); padding: 14px 0 10px; }
  .dock-inner { display: flex; gap: 10px; align-items: center; max-width: 800px; }
  .dock-inner input { flex: 1; min-width: 0; padding: 13px 16px; border-radius: 999px; }
  .dock-inner .primary { border-radius: 999px; padding: 12px 22px; }
  .mic { width: 48px; height: 48px; padding: 0; border-radius: 50%; justify-content: center; flex: none; }
  .mic svg { width: 22px; height: 22px; }
  .mic[aria-pressed="true"] { background: var(--bad); border-color: transparent; color: #fff; }
  .dock-hint { text-align: center; font-size: 12.5px; color: var(--muted); margin: 8px auto 0; max-width: 800px; }

  @media (max-width: 560px) {
    .dock-inner .primary { padding: 12px 16px; }
    .suggest { font-size: 13.5px; }
  }
`;

const SIMULATOR_SCRIPT = `
(function () {
  var log = document.getElementById('log');
  var stage = document.getElementById('stage');
  var orb = document.getElementById('orb');
  var input = document.getElementById('say');
  var go = document.getElementById('go');
  var mic = document.getElementById('mic');
  var hint = document.getElementById('hint');
  var context = {};
  var busy = false;

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  if (Recognition) {
    recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = function (event) { ask(event.results[0][0].transcript); };
    recognition.onend = function () { mic.setAttribute('aria-pressed', 'false'); orb.classList.remove('listening'); };
    recognition.onerror = recognition.onend;
    hint.textContent = 'Speech runs in your browser. Nothing is sent anywhere but your own server.';
  } else {
    mic.disabled = true;
    hint.textContent = 'This browser cannot listen. Type instead — everything else works.';
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch (ignored) { /* speech is a bonus, never a requirement */ }
  }

  function addTurn(role, text) {
    var turn = make('div', 'turn ' + role);
    turn.appendChild(make('div', 'bubble', text));
    log.appendChild(turn);
    return turn;
  }

  function scrollDown() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }

  function ask(text) {
    if (busy || !text || !text.trim()) return;
    busy = true;
    go.disabled = true;
    input.value = '';
    stage.classList.add('compact');
    orb.classList.add('thinking');

    addTurn('user', text);
    var pending = addTurn('bot', 'Asking your stack…');
    pending.firstChild.classList.add('thinking');
    scrollDown();

    fetch('/simulator/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: text, context: context })
    })
      .then(function (response) { return response.json(); })
      .then(function (turn) {
        pending.innerHTML = '';
        pending.appendChild(make('div', 'bubble', turn.spoken));
        if (turn.trace) {
          var line = make('div', 'trace' + (turn.trace.isError ? ' err' : ''));
          line.appendChild(make('span', 'dot ok'));
          line.appendChild(make('b', null, turn.trace.tool));
          var args = JSON.stringify(turn.trace.args);
          if (args !== '{}') line.appendChild(make('span', null, args));
          line.appendChild(make('span', null, turn.trace.latencyMs + ' ms'));
          pending.appendChild(line);
        }
        if (turn.context) context = turn.context;
        speak(turn.spoken);
      })
      .catch(function () {
        pending.innerHTML = '';
        pending.appendChild(make('div', 'bubble', 'The server did not answer.'));
      })
      .then(function () {
        busy = false;
        go.disabled = false;
        orb.classList.remove('thinking');
        input.focus();
        scrollDown();
      });
  }

  document.getElementById('form').addEventListener('submit', function (event) {
    event.preventDefault();
    ask(input.value);
  });

  document.getElementById('chips').addEventListener('click', function (event) {
    if (event.target.classList.contains('suggest')) ask(event.target.textContent);
  });

  mic.addEventListener('click', function () {
    if (!recognition) return;
    if (mic.getAttribute('aria-pressed') === 'true') { recognition.stop(); return; }
    mic.setAttribute('aria-pressed', 'true');
    orb.classList.add('listening');
    recognition.start();
  });
})();
`;
