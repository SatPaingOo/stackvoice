export interface SimulatorAppSummary {
  readonly id: string;
  readonly label: string;
  readonly searchable: boolean;
}

/**
 * The simulator page: one self-contained HTML document, no build step and no
 * CDN, so a judge can clone the repo and open it offline.
 *
 * Speech in and speech out come from the browser's own Web Speech API, which
 * keeps the $0 budget intact and means no audio leaves the machine.
 */
export function renderSimulatorPage(apps: readonly SimulatorAppSummary[]): string {
  const suggestions = buildSuggestions(apps);
  const appList = apps.map((app) => escapeHtml(app.label)).join(', ') || 'no apps configured';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StackVoice — simulated Alexa+</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f4f2; --panel: #fff; --line: #e4e2dd; --ink: #191917; --muted: #6f6d66;
    --accent: #c96442; --user: #1f1e1c; --chip: #efede8; --ok: #3f7d58; --bad: #b5372a;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #191917; --panel: #232320; --line: #35342f; --ink: #f2f0eb; --muted: #a3a099;
            --user: #35342f; --chip: #2c2b27; --ok: #6cc08b; --bad: #e0705f; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 140px; }
  header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  .badge { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
           background: var(--chip); color: var(--muted); }
  .sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
  .sub code { background: var(--chip); padding: 1px 5px; border-radius: 4px; font-size: 13px; }

  #log { display: flex; flex-direction: column; gap: 14px; }
  .turn { display: flex; flex-direction: column; gap: 6px; }
  .turn.user { align-items: flex-end; }
  .bubble { max-width: 88%; padding: 11px 15px; border-radius: 16px; white-space: pre-wrap; }
  .user .bubble { background: var(--user); color: #fff; border-bottom-right-radius: 5px; }
  @media (prefers-color-scheme: dark) { .user .bubble { color: var(--ink); } }
  .bot .bubble { background: var(--panel); border: 1px solid var(--line); border-bottom-left-radius: 5px; }
  .trace { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted);
           display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-left: 4px; }
  .trace .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex: none; }
  .trace.err .dot { background: var(--bad); }
  .trace b { color: var(--ink); font-weight: 600; }
  .thinking { color: var(--muted); font-style: italic; }

  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 0; }
  .chip { background: var(--chip); border: 1px solid var(--line); color: var(--ink);
          border-radius: 999px; padding: 7px 13px; font-size: 13px; cursor: pointer; font-family: inherit; }
  .chip:hover { border-color: var(--accent); }

  .dock { position: fixed; left: 0; right: 0; bottom: 0; background: var(--bg);
          border-top: 1px solid var(--line); padding: 14px 16px; }
  .dock .row { max-width: 760px; margin: 0 auto; display: flex; gap: 10px; align-items: center; }
  /* min-width:0 or the input refuses to shrink and pushes Ask off a phone screen. */
  #say { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line);
         background: var(--panel); color: var(--ink); font: inherit; }
  #say:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  button.go, button.mic { border: 0; border-radius: 10px; padding: 12px 16px; font: inherit;
                          font-weight: 600; cursor: pointer; background: var(--accent); color: #fff; }
  button.mic { background: var(--panel); color: var(--ink); border: 1px solid var(--line); }
  button.mic[aria-pressed="true"] { background: var(--bad); color: #fff; border-color: transparent; }
  button:disabled { opacity: .5; cursor: default; }
  .hint { max-width: 760px; margin: 8px auto 0; font-size: 12px; color: var(--muted); text-align: center; }
  @media (max-width: 520px) {
    .dock { padding: 12px 10px; }
    .dock .row { gap: 8px; }
    button.go, button.mic { padding: 12px; }
    button.mic .label { display: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>StackVoice</h1>
    <span class="badge">Simulated Alexa+</span>
  </header>
  <p class="sub">Ask your own stuff, not the internet. Connected to <code>${appList}</code> over MCP.</p>

  <div id="log" aria-live="polite"></div>

  <div class="chips" id="chips">
    ${suggestions.map((text) => `<button class="chip" type="button">${escapeHtml(text)}</button>`).join('\n    ')}
  </div>
</div>

<div class="dock">
  <div class="row">
    <button class="mic" id="mic" type="button" aria-pressed="false" title="Speak">🎙<span class="label"> Speak</span></button>
    <input id="say" placeholder="Ask about your stack…" autocomplete="off" autofocus>
    <button class="go" id="go" type="button">Ask</button>
  </div>
  <p class="hint" id="hint"></p>
</div>

<script>
(function () {
  var log = document.getElementById('log');
  var input = document.getElementById('say');
  var go = document.getElementById('go');
  var mic = document.getElementById('mic');
  var hint = document.getElementById('hint');
  var context = {};
  var busy = false;

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  if (Recognition) {
    recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (event) {
      var said = event.results[0][0].transcript;
      input.value = said;
      ask(said);
    };
    recognition.onend = function () { mic.setAttribute('aria-pressed', 'false'); };
    recognition.onerror = function () { mic.setAttribute('aria-pressed', 'false'); };
    hint.textContent = 'Speech runs in your browser. Nothing is sent anywhere but your own server.';
  } else {
    mic.disabled = true;
    hint.textContent = 'This browser has no speech recognition. Type instead — everything else works.';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addTurn(role, text) {
    var turn = el('div', 'turn ' + role);
    turn.appendChild(el('div', 'bubble', text));
    log.appendChild(turn);
    window.scrollTo(0, document.body.scrollHeight);
    return turn;
  }

  function addTrace(turn, trace) {
    var line = el('div', 'trace' + (trace.isError ? ' err' : ''));
    line.appendChild(el('span', 'dot'));
    var name = el('b', null, trace.tool);
    line.appendChild(name);
    var args = JSON.stringify(trace.args);
    if (args !== '{}') line.appendChild(el('span', null, args));
    line.appendChild(el('span', null, trace.latencyMs + ' ms'));
    turn.appendChild(line);
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

  function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    go.disabled = true;
    input.value = '';
    addTurn('user', text);

    var pending = addTurn('bot', 'Asking your stack…');
    pending.firstChild.classList.add('thinking');

    fetch('/simulator/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: text, context: context })
    })
      .then(function (response) { return response.json(); })
      .then(function (turn) {
        pending.innerHTML = '';
        pending.appendChild(el('div', 'bubble', turn.spoken));
        if (turn.trace) addTrace(pending, turn.trace);
        if (turn.context) context = turn.context;
        speak(turn.spoken);
      })
      .catch(function () {
        pending.innerHTML = '';
        pending.appendChild(el('div', 'bubble', 'The server did not answer.'));
      })
      .then(function () {
        busy = false;
        go.disabled = false;
        input.focus();
        window.scrollTo(0, document.body.scrollHeight);
      });
  }

  go.addEventListener('click', function () { ask(input.value); });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') ask(input.value);
  });
  mic.addEventListener('click', function () {
    if (!recognition) return;
    if (mic.getAttribute('aria-pressed') === 'true') {
      recognition.stop();
      return;
    }
    mic.setAttribute('aria-pressed', 'true');
    recognition.start();
  });
  document.getElementById('chips').addEventListener('click', function (event) {
    if (event.target.classList.contains('chip')) ask(event.target.textContent);
  });
})();
</script>
</body>
</html>`;
}

/** Prompts drawn from the configured apps, so the demo works for any stack. */
function buildSuggestions(apps: readonly SimulatorAppSummary[]): string[] {
  const suggestions = ['Is my stack healthy?'];
  const searchable = apps.filter((app) => app.searchable);

  if (searchable[0] !== undefined) {
    suggestions.push(`What did you find about AI in my ${shortLabel(searchable[0].label)}?`);
  }
  if (searchable[1] !== undefined) {
    suggestions.push(`Anything on Iran in my ${shortLabel(searchable[1].label)}?`);
  }
  if (apps[0] !== undefined) {
    suggestions.push(`Did my ${shortLabel(apps[0].label)} run last night?`);
  }
  suggestions.push('Tell me more');
  return suggestions;
}

/** Labels are written for tool descriptions; spoken prompts want them lowercase. */
function shortLabel(label: string): string {
  return label.toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
