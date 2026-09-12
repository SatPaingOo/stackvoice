import { escapeHtml, renderPage } from '../web/layout.js';

export interface SimulatorAppSummary {
  readonly id: string;
  readonly label: string;
  readonly searchable: boolean;
}

/**
 * The simulator: a simulated Alexa+ client that talks to this server over MCP.
 *
 * Two ways to use it. Push to talk asks one question. A conversation keeps going
 * on its own: it listens, answers out loud, and listens again, the way a person
 * talks to a speaker, until you say stop or go quiet.
 *
 * Speech in and out come from the browser's own Web Speech API, so the $0 budget
 * holds. That does not make speech local: Chrome sends recognition audio to
 * Google and Edge to Microsoft. What stays on this server is the data.
 *
 * Every answer shows the tool call that produced it, because the point of the
 * demo is the mechanism, not the magic.
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
    <button type="button" class="orb idle" id="orb" aria-label="Ask by voice">
      <span></span><span></span><span></span>
    </button>
    <div class="stage-text">
      <h1 id="headline">Ask your stack</h1>
      <p class="soft" id="subline">${
        apps.length === 0
          ? 'No apps are connected yet. <a href="/console">Add one</a> first.'
          : `Connected to ${apps.map((app) => escapeHtml(app.label)).join(', ')}.`
      }</p>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </div>
    <div class="stage-actions">
      <button type="button" class="primary talk" id="talk" aria-pressed="false">Start a conversation</button>
    </div>
    <div class="chips-row" id="chips">
      ${suggestions.map((text) => `<button class="suggest" type="button">${escapeHtml(text)}</button>`).join('')}
    </div>
  </section>

  <section id="log" class="log" aria-live="polite"></section>
</main>

<div class="dock">
  <form class="shell dock-inner" id="form">
    <button type="button" class="mic" id="mic" aria-pressed="false" title="Ask one question by voice">
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
              margin-top: 22px; letter-spacing: -0.02em; }
  .stage #subline { margin: 10px auto 0; max-width: 56ch; }
  .status { min-height: 1.5em; margin: 10px 0 0; font-size: 14.5px; color: var(--muted); }
  .stage-actions { display: flex; justify-content: center; margin-top: 18px; }
  .talk { border-radius: 999px; padding: 12px 22px; }
  .talk[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
  .talk[aria-pressed="true"]:hover { background: var(--ink-soft); color: var(--bg); }

  /* Once the conversation starts, the stage folds into a bar that stays in view,
     so the circle, the status and the stop button are always one glance away. */
  .stage.compact {
    position: sticky; top: 62px; z-index: 10;
    display: flex; align-items: center; gap: 14px; text-align: left;
    margin: 0 calc(var(--gutter) * -1); padding: 10px var(--gutter);
    background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line-soft);
  }
  .stage.compact .stage-text { flex: 1; min-width: 0; }
  .stage.compact h1 { font: 600 16px var(--sans); margin: 0; letter-spacing: 0; }
  .stage.compact #subline, .stage.compact .chips-row { display: none; }
  .stage.compact .status { margin: 2px 0 0; font-size: 13.5px; min-height: 1.3em; }
  .stage.compact .stage-actions { margin: 0; }
  .stage.compact .talk { padding: 9px 16px; font-size: 14px; }

  /* The circle is a button: tap to talk, tap again while it speaks to interrupt. */
  .orb { position: relative; display: block; width: 96px; height: 96px; margin: 0 auto; padding: 0;
         border: 0; border-radius: 50%; background: none; cursor: pointer; }
  .orb:hover { border-color: transparent; }
  .orb:active { transform: none; }
  .orb:focus-visible { outline: 3px solid var(--accent-soft); outline-offset: 5px; }
  .stage.compact .orb { width: 46px; height: 46px; margin: 0; flex: none; }
  .orb span { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
              background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 70%, #fff), var(--accent)); }
  .orb span:nth-child(2), .orb span:nth-child(3) { background: var(--accent); opacity: 0; }
  .orb.idle span:first-child { animation: breathe 4s ease-in-out infinite; }
  .orb.listening span:nth-child(2) { animation: ring 1.6s ease-out infinite; }
  .orb.listening span:nth-child(3) { animation: ring 1.6s ease-out .8s infinite; }
  .orb.thinking span:first-child { animation: breathe 1s ease-in-out infinite; }
  .orb.speaking span:first-child { animation: voice .42s ease-in-out infinite alternate; }
  @keyframes ring { from { transform: scale(1); opacity: .45; } to { transform: scale(1.9); opacity: 0; } }
  @keyframes breathe { 50% { transform: scale(.92); opacity: .8; } }
  @keyframes voice { from { transform: scale(.93); } to { transform: scale(1.07); } }

  .chips-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 22px; }
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

  @media (max-width: 720px) { .stage.compact { top: 56px; } }
  @media (max-width: 560px) {
    .dock-inner .primary { padding: 12px 16px; }
    .suggest { font-size: 13.5px; }
    .stage.compact h1 { display: none; }
  }
`;

/*
 * Kept free of backslashes on purpose: this is a TypeScript template literal, and
 * an escape such as a regex whitespace class would be silently mangled before the
 * browser ever saw it.
 */
const SIMULATOR_SCRIPT = `
(function () {
  var log = document.getElementById('log');
  var stage = document.getElementById('stage');
  var orb = document.getElementById('orb');
  var statusEl = document.getElementById('status');
  var talk = document.getElementById('talk');
  var input = document.getElementById('say');
  var go = document.getElementById('go');
  var mic = document.getElementById('mic');
  var hint = document.getElementById('hint');

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis || null;

  var MAX_SILENCES = 2;
  var STOP_PHRASES = ['stop', 'stop listening', 'goodbye', 'bye', 'thats all', 'that is all',
                      'end conversation', 'end the conversation', 'thank you thats all'];

  var context = {};
  var busy = false;
  var mode = 'idle';
  var conversation = false;
  var silences = 0;
  var recognizer = null;
  var nextListen = 0;
  var statusFromState = false;

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---- state ---------------------------------------------------------------

  /** A message the user should read; it survives the next change of state. */
  function setStatus(text, fromState) {
    statusEl.textContent = text || '';
    statusFromState = !!fromState;
  }

  function setMode(next) {
    mode = next;
    orb.className = 'orb ' + next;
    mic.setAttribute('aria-pressed', next === 'listening' ? 'true' : 'false');
    orb.setAttribute('aria-label', next === 'speaking' ? 'Interrupt' : next === 'listening' ? 'Stop listening' : 'Ask by voice');

    if (next === 'listening') setStatus(conversation ? 'Listening. Go ahead.' : 'Listening…', true);
    else if (next === 'thinking') setStatus('Thinking…', true);
    else if (next === 'speaking') setStatus('Speaking. Tap the circle to interrupt.', true);
    else if (statusFromState) setStatus(conversation ? 'Your turn in a moment.' : '', true);
  }

  function setConversation(on) {
    conversation = on;
    talk.setAttribute('aria-pressed', on ? 'true' : 'false');
    talk.textContent = on ? 'End conversation' : 'Start a conversation';
    if (!on) {
      silences = 0;
      clearTimeout(nextListen);
    }
  }

  function isSpeaking() {
    return !!(synth && synth.speaking);
  }

  // ---- listening -----------------------------------------------------------

  function listen() {
    clearTimeout(nextListen);
    if (!Recognition || recognizer || busy) return;

    // Never listen over our own voice: the microphone would hear the answer and
    // send it back as the next question.
    if (isSpeaking()) {
      nextListen = setTimeout(listen, 300);
      return;
    }

    var session = new Recognition();
    var heard = [];
    var outcome = { denied: false, cancelled: false };
    session.lang = 'en-US';
    session.continuous = false;
    session.interimResults = false;
    session.maxAlternatives = 1;

    session.onresult = function (event) {
      // Browsers disagree on delivery. Edge splits one sentence across several
      // events; Chrome on Android repeats a final one. Keying each phrase by its
      // result index means a repeat overwrites itself instead of adding a copy.
      for (var i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) heard[i] = String(event.results[i][0].transcript).trim();
      }
    };

    session.onerror = function (event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') outcome.denied = true;
    };

    session.onend = function () {
      if (recognizer === session) recognizer = null;
      if (outcome.cancelled) {
        setMode('idle');
        return;
      }

      // One question per listening session, asked when listening ends. Never
      // per result event: that is what used to ask the same thing twice.
      var text = joinHeard(heard);
      if (text) {
        silences = 0;
        handleSpoken(text);
        return;
      }

      setMode('idle');
      if (outcome.denied) {
        setConversation(false);
        setStatus('Microphone access is blocked. Allow it in the browser to talk.');
        return;
      }
      if (conversation) {
        silences += 1;
        if (silences >= MAX_SILENCES) {
          setConversation(false);
          setStatus('I did not hear anything, so I stopped listening.');
          return;
        }
        listenSoon();
      }
    };

    recognizer = session;
    session.stackvoiceOutcome = outcome;
    setMode('listening');
    try {
      session.start();
    } catch (error) {
      recognizer = null;
      setMode('idle');
    }
  }

  /** Joins the phrases heard, dropping a phrase repeated back to back. */
  function joinHeard(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      if (out.length && out[out.length - 1].toLowerCase() === part.toLowerCase()) continue;
      out.push(part);
    }
    return out.join(' ').split(' ').filter(function (word) { return word !== ''; }).join(' ');
  }

  function isStop(text) {
    var clean = text.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(function (w) { return w !== ''; }).join(' ');
    return STOP_PHRASES.indexOf(clean) !== -1;
  }

  function listenSoon() {
    clearTimeout(nextListen);
    // A short pause, so the tail of the answer is not caught by the microphone.
    nextListen = setTimeout(listen, 250);
  }

  function stopListening(discard) {
    if (!recognizer) return;
    if (discard) recognizer.stackvoiceOutcome.cancelled = true;
    try {
      if (discard) recognizer.abort();
      else recognizer.stop();
    } catch (error) { /* already ended */ }
  }

  function handleSpoken(text) {
    if (conversation && isStop(text)) {
      setConversation(false);
      addTurn('user', text);
      addTurn('bot', 'Okay. Talk soon.');
      speakThen('Okay. Talk soon.', null);
      scrollDown();
      return;
    }
    ask(text);
  }

  // ---- speaking ------------------------------------------------------------

  function speakThen(text, next) {
    var done = false;
    var guard = 0;

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(guard);
      setMode('idle');
      if (next) next();
    }

    if (!synth || !window.SpeechSynthesisUtterance || !text) {
      finish();
      return;
    }

    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onend = finish;
    utterance.onerror = finish;
    setMode('speaking');

    // Chrome can lose the end event on a long utterance. A conversation must not
    // hang waiting for it, so keep checking, and give up after a generous limit.
    var started = Date.now();
    var limit = text.length * 120 + 5000;
    guard = setTimeout(function check() {
      if (isSpeaking() && Date.now() - started < limit) {
        guard = setTimeout(check, 400);
        return;
      }
      if (isSpeaking()) synth.cancel();
      finish();
    }, Math.max(1200, text.length * 60));

    try {
      synth.cancel();
      synth.speak(utterance);
    } catch (error) {
      finish();
    }
  }

  function afterAnswer() {
    if (conversation) listenSoon();
  }

  // ---- asking --------------------------------------------------------------

  function addTurn(role, text) {
    var turn = make('div', 'turn ' + role);
    turn.appendChild(make('div', 'bubble', text));
    log.appendChild(turn);
    return turn;
  }

  function scrollDown() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function ask(text) {
    text = String(text || '').trim();
    if (busy || !text) return;
    busy = true;
    go.disabled = true;
    input.value = '';
    stage.classList.add('compact');
    setMode('thinking');

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
        busy = false;
        go.disabled = false;
        speakThen(turn.spoken, afterAnswer);
      })
      .catch(function () {
        pending.innerHTML = '';
        pending.appendChild(make('div', 'bubble', 'The server did not answer.'));
        busy = false;
        go.disabled = false;
        setMode('idle');
        if (conversation) {
          setConversation(false);
          setStatus('The server did not answer, so I ended the conversation.');
        }
      })
      .then(function () {
        scrollDown();
        if (!conversation) input.focus();
      });
  }

  // ---- controls ------------------------------------------------------------

  if (!Recognition) {
    mic.disabled = true;
    talk.classList.add('hidden');
    hint.textContent = 'This browser cannot listen. Type instead — everything else works.';
  } else {
    hint.textContent = 'Your browser turns speech into text, and may use its maker’s speech service to do it. Your records stay on your server.';
  }

  talk.addEventListener('click', function () {
    if (conversation) {
      setConversation(false);
      stopListening(true);
      if (isSpeaking()) synth.cancel();
      setMode('idle');
      setStatus('Conversation ended.');
      return;
    }
    setConversation(true);
    if (isSpeaking()) synth.cancel();
    listen();
  });

  orb.addEventListener('click', function () {
    if (!Recognition) return;
    if (mode === 'speaking') {
      // Interrupt. In a conversation the loop listens again on its own.
      synth.cancel();
      if (!conversation) listen();
      return;
    }
    if (mode === 'listening') {
      stopListening(false);
      return;
    }
    if (mode === 'thinking') return;
    listen();
  });

  mic.addEventListener('click', function () {
    if (!Recognition) return;
    if (mode === 'listening') {
      stopListening(false);
      return;
    }
    if (mode === 'speaking' && synth) synth.cancel();
    listen();
  });

  document.getElementById('form').addEventListener('submit', function (event) {
    event.preventDefault();
    ask(input.value);
  });

  document.getElementById('chips').addEventListener('click', function (event) {
    if (event.target.classList.contains('suggest')) ask(event.target.textContent);
  });
})();
`;
