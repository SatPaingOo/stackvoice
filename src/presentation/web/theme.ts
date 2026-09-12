/**
 * The design tokens and base styles every page shares.
 *
 * One string rather than a stylesheet file: the server has no build step and no
 * CDN, so a judge can clone the repo and everything renders offline. Keeping it
 * in one place is what stops the console, the landing page and the simulator
 * drifting into three different products.
 */
export const THEME_CSS = `
  :root {
    color-scheme: light dark;

    /* surfaces */
    --bg: #faf9f7;
    --bg-alt: #f2f0ec;
    --panel: #ffffff;
    --line: #e6e3dd;
    --line-soft: #efece6;

    /* ink */
    --ink: #191917;
    --ink-soft: #57544d;
    --muted: #86827a;

    /* accents */
    --accent: #c96442;
    --accent-soft: #f3e2db;
    --accent-ink: #a44b2e;
    --ok: #3f7d58;
    --bad: #b5372a;
    --warn: #9a6b18;
    --info: #3b6fb6;
    --violet: #7b5cc4;

    --radius: 14px;
    --radius-sm: 9px;
    --shadow: 0 1px 2px rgba(25, 25, 23, .04), 0 8px 24px -12px rgba(25, 25, 23, .12);
    --shadow-lg: 0 2px 4px rgba(25, 25, 23, .05), 0 24px 48px -20px rgba(25, 25, 23, .22);

    --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

    --page: 1080px;
    --gutter: clamp(18px, 4vw, 36px);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161614;
      --bg-alt: #1d1c19;
      --panel: #222220;
      --line: #37352f;
      --line-soft: #2c2b27;
      --ink: #f4f2ed;
      --ink-soft: #c4c0b7;
      --muted: #97938a;
      --accent: #e08461;
      --accent-soft: #3a2620;
      --accent-ink: #f0a582;
      --ok: #6cc08b;
      --bad: #e0705f;
      --warn: #d9a441;
      --info: #7fa8e6;
      --violet: #b59cf2;
      --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px -12px rgba(0, 0, 0, .5);
      --shadow-lg: 0 2px 4px rgba(0, 0, 0, .35), 0 24px 48px -20px rgba(0, 0, 0, .6);
    }
  }

  * { box-sizing: border-box; }

  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  a { color: var(--accent-ink); text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { color: var(--accent); }

  code, kbd { font-family: var(--mono); font-size: .9em; }
  code { background: var(--bg-alt); padding: .1em .4em; border-radius: 5px; }

  h1, h2, h3 { line-height: 1.2; letter-spacing: -0.015em; margin: 0; }

  .shell { max-width: var(--page); margin: 0 auto; padding: 0 var(--gutter); }
  .stack > * + * { margin-top: 14px; }
  .muted { color: var(--muted); }
  .soft { color: var(--ink-soft); }
  .hidden { display: none !important; }
  .grow { flex: 1; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

  /* ---- surfaces ---- */
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    box-shadow: var(--shadow);
  }

  .chip {
    display: inline-block;
    font: 12px/1.5 var(--mono);
    background: var(--bg-alt);
    border: 1px solid var(--line-soft);
    border-radius: 6px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 600; letter-spacing: .01em;
    background: var(--accent-soft); color: var(--accent-ink);
    border-radius: 999px; padding: 4px 11px;
  }

  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--muted); }
  .dot.ok { background: var(--ok); }
  .dot.bad { background: var(--bad); }

  /* ---- controls ---- */
  button, .btn {
    font: 15px/1 var(--sans); font-weight: 500;
    border: 1px solid var(--line);
    background: var(--panel); color: var(--ink);
    border-radius: var(--radius-sm);
    padding: 10px 16px;
    cursor: pointer;
    transition: border-color .15s, background .15s, transform .08s;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 8px;
  }
  button:hover, .btn:hover { border-color: var(--accent); color: var(--ink); }
  button:active, .btn:active { transform: translateY(1px); }
  button:disabled { opacity: .45; cursor: default; transform: none; }

  button.primary, .btn.primary {
    background: var(--accent); border-color: transparent; color: #fff; font-weight: 600;
  }
  button.primary:hover, .btn.primary:hover { background: var(--accent-ink); color: #fff; }
  button.ghost { background: transparent; border-color: transparent; color: var(--ink-soft); }
  button.ghost:hover { background: var(--bg-alt); color: var(--ink); }
  button.danger:hover { border-color: var(--bad); color: var(--bad); }
  button.small { padding: 7px 12px; font-size: 14px; }

  label { display: block; font-size: 13px; font-weight: 500; color: var(--ink-soft); margin: 0 0 6px; }
  label .hint { font-weight: 400; color: var(--muted); }

  input[type=text], input[type=password], input[type=number], textarea, select {
    width: 100%;
    padding: 11px 13px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    color: var(--ink);
    font: 15px/1.5 var(--sans);
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  textarea { min-height: 74px; resize: vertical; }
  .field + .field { margin-top: 16px; }

  .switch { display: flex; align-items: center; gap: 9px; font-size: 15px; color: var(--ink); margin: 0; }
  .switch input { width: auto; accent-color: var(--accent); }

  /* ---- notices ---- */
  .note { font-size: 14px; padding: 11px 14px; border-radius: var(--radius-sm); margin-top: 14px; }
  .note.err { background: color-mix(in srgb, var(--bad) 10%, transparent); color: var(--bad); }
  .note.ok { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); }
  .note.warn { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
  .note.info { background: var(--bg-alt); color: var(--ink-soft); }

  /* ---- app chrome ---- */
  .topbar {
    position: sticky; top: 0; z-index: 20;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line-soft);
  }
  .topbar .inner { display: flex; align-items: center; gap: 10px; height: 62px; }

  .brand { display: flex; align-items: center; gap: 9px; font-weight: 650; font-size: 17px;
           color: var(--ink); text-decoration: none; letter-spacing: -0.02em; }
  .brand:hover { color: var(--ink); }
  .brand .mark { width: 22px; height: 22px; flex: none; }

  .nav { display: flex; gap: 2px; }
  .nav a {
    font-size: 14.5px; font-weight: 500; color: var(--ink-soft); text-decoration: none;
    padding: 7px 12px; border-radius: var(--radius-sm);
  }
  .nav a:hover { background: var(--bg-alt); color: var(--ink); }
  .nav a.on { background: var(--accent-soft); color: var(--accent-ink); }
  .nav a { white-space: nowrap; }

  /* A phone cannot fit the wordmark and four links on one row. The mark stays,
     the word goes and the links tighten, so nothing wraps onto a second line.
     The selector is deliberately more specific than the 720px rule further down,
     which would otherwise win by coming later. */
  @media (max-width: 480px) {
    .brand .word { display: none; }
    .topbar .inner { gap: 4px; }
    .topbar .nav { gap: 0; }
    .topbar .nav a { padding: 7px 8px; font-size: 14px; }
  }

  /* Vertical only: .page sits on the same element as .shell, and a padding
     shorthand here would erase the horizontal gutter .shell provides. */
  .page { padding-top: 34px; padding-bottom: 96px; }
  .page-head { margin-bottom: 26px; }
  .page-head h1 { font-size: clamp(24px, 3.2vw, 30px); }
  .page-head p { margin: 7px 0 0; color: var(--muted); font-size: 15px; max-width: 62ch; }

  footer.site { border-top: 1px solid var(--line-soft); padding: 26px 0; color: var(--muted); font-size: 14px; }
  footer.site .inner { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }

  /* ---- motion ---- */
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .rise { animation: rise .6s cubic-bezier(.2, .7, .3, 1) both; }
  /* Hidden only once script has marked the page, so a section is never stuck
     invisible when script is off, slow, or the observer never reports. */
  html.js .reveal { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s cubic-bezier(.2,.7,.3,1); }
  html.js .reveal.seen { opacity: 1; transform: none; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
    html.js .reveal { opacity: 1; transform: none; }
  }

  @media (max-width: 720px) {
    .topbar .inner { height: 56px; }
    .nav a { padding: 7px 9px; font-size: 14px; }
    .page { padding-top: 24px; padding-bottom: 72px; }
  }
`;

/** The wordmark glyph, inline so no request is needed. */
export const LOGO_SVG = `<svg class="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="2.5" y="4" width="19" height="4.4" rx="2.2" fill="currentColor" opacity=".28"/>
  <rect x="2.5" y="9.8" width="19" height="4.4" rx="2.2" fill="currentColor" opacity=".58"/>
  <rect x="2.5" y="15.6" width="19" height="4.4" rx="2.2" fill="currentColor"/>
</svg>`;
