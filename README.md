# StackVoice

**Ask your own stuff — not the internet.**

StackVoice is a self-hosted **MCP server** that turns your own data projects
(GitHub pipelines, datasets, libraries, feeds) into tools an AI assistant can
call. You point it at *your* apps in config; tools are generated for those apps
automatically. The assistant understands the user's words — StackVoice gives the
assistant the hands.

- **Status:** working. MCP server, two live demo apps, OAuth 2.1, a web console
  for adding your own, a CLI, and a simulated Alexa+ page.
- **Target:** Amazon *Build, Ship, Shape* hackathon — Alexa+ track (deadline Oct 23, 2026).
- **Stack:** Node.js 20+ / TypeScript · MCP spec 2025-11-25 · Streamable HTTP · $0 budget.

## Try it in two minutes

```bash
npm install
npm run dev
```

Open **http://localhost:8765/simulator** and ask it something:

> "Is my stack healthy?" · "What did you find about AI in my library?" · "Tell me more"

That page is a simulated Alexa+ client. It talks to the MCP server over the same
Streamable HTTP transport a device would use, and shows every tool call it makes
underneath the answer. Speech in and out run in your browser, so nothing leaves
your machine.

Out of the box it is pointed at two real, live pipelines —
[information-hub](https://github.com/SatPaingOo/information-hub) (177 verified
articles, growing daily) and [eventpulse](https://github.com/SatPaingOo/eventpulse)
(event → market intelligence). Nothing in the demo is mocked.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page — the idea in ten seconds, with the live numbers from your stack |
| `/simulator` | Ask your stack by voice or text; every answer shows the tool call behind it |
| `/console` | Your apps — add, edit, enable, disable, remove, and see their health |
| `/console/shortcuts` | Build one tool that runs several |
| `/console/settings` | Access mode, the MCP address to connect, which pages are on, server options |
| `/mcp` | The MCP endpoint itself, for any client |

Every page is rendered by the server with no build step and no CDN, and each one
adapts from a phone to a desktop.

## Point it at your own data

Your data project publishes JSON somewhere in a public GitHub repo. That is the
only requirement.

### In a browser

Open **http://localhost:8765/console**, click **Add an app**, and paste your
repository. StackVoice fetches your read models, finds the records, and works out
which field is the title, which is the summary, which is the date, and where the
freshness and item counts live. It shows you every guess with a sample value from
your own data, you correct anything that looks wrong, and you click Save.

Your assistant can use it in the next sentence. No restart, no YAML, no terminal.

The same page lists what you have, shows whether each app is healthy and how
fresh its data is, and lets you edit, disable or remove any of them. When the
server is exposed beyond localhost it asks for your `auth.token` first.

### From a terminal

```bash
npm run stackvoice -- app add mynotes --repo me/my-pipeline
```

Same inference, same output:

```
  Found 177 records in data/views/index.json.

  Field mapping (inferred)
  FIELD    FROM        EXAMPLE
  key      key         2026-09-12-001
  title    title       Houthis claim major advance in Yemen and tighten grip...
  summary  tldr        The Iran-backed Houthis have seized the strategic...
  date     date        2026-09-12
  topic    topic       world
  region   region      global
  url      source_url  https://www.bbc.co.uk/news/articles/c23x72yx2rvo...

  Status reads data/views/stats.json — freshness from "last_date", count from "total_items"

  ✓ wrote config/apps/mynotes.yml

  New tools once the server picks it up: mynotes_search, mynotes_read, mynotes_status
```

Any guess that is wrong is one line to change in the generated file. The server
watches `config/apps/` and reloads on its own.

## Shortcuts

A shortcut is one tool that runs several, so "what's my morning brief" is a
single question instead of three. Build one in the console's Shortcuts section:
name it the way you would say it, pick the tools, and choose how the answers are
stitched together.

The name is what makes it work by voice. "Morning brief" becomes the tool
`morning_brief`, and both the simulator and a real assistant route the phrase
straight to it.

### The rest of the CLI

```bash
npm run stackvoice -- apps                 # what is configured
npm run stackvoice -- status               # is everything running, how fresh is it
npm run stackvoice -- shortcuts            # shortcuts and what they run
npm run stackvoice -- app show mynotes     # the effective config
npm run stackvoice -- app validate         # check config without starting the server
npm run stackvoice -- app disable mynotes  # stop exposing it
npm run stackvoice -- app remove mynotes --yes
```

Every write validates first and backs up whatever it replaces into
`config/backups/`.

## Connecting a real assistant

The server speaks plain MCP, so any client works — MCP Inspector, a coding
agent, or Alexa+:

```bash
npx @modelcontextprotocol/inspector      # point it at http://localhost:8765/mcp
```

For anything beyond localhost, set `auth.mode` in `config/settings.yml`:
`token` for one shared bearer token, or `oauth` for the full OAuth 2.1 + PKCE
flow that Alexa+ requires. See [CONFIGURATION.md](./CONFIGURATION.md) §2.

## What's inside

1. **Config-driven MCP core** — one server, tools generated from config at startup.
2. **Multi-app registry** — add as many apps as you want (`config/apps/*.yml`);
   every app gets its own tool namespace.
3. **Management system** — add, inspect, validate and monitor apps from a web
   console or a CLI, both over the same service.
4. **Standards-compliant engineering** — OOP + SOLID + Clean/Hexagonal
   architecture (see CODING_STANDARDS.md and ARCHITECTURE.md).
5. **Voice-shaped responses** — tool results come back as sentences a person can
   listen to, not JSON a speaker cannot read aloud.
6. **Shortcuts** — one tool that runs several, for the questions you ask every
   morning.

## Docs map

| Doc | Covers |
|---|---|
| [FRAMEWORK.md](./FRAMEWORK.md) | Product concept, verified hackathon constraints, judging map, roadmap, risks |
| [RESEARCH.md](./RESEARCH.md) | Landscape research — who is building what in private-data × MCP × voice |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture — layers, ports & adapters, multi-app design, management subsystem, SOLID mapping |
| [CONFIGURATION.md](./CONFIGURATION.md) | User config schema — `settings.yml` + `config/apps/*.yml`, validation rules, worked examples |
| [MANAGEMENT.md](./MANAGEMENT.md) | Management system — features, web console, CLI, safety model |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Engineering standards — OOP/SOLID/Clean, TypeScript, error handling, testing, git |
| [FRICTION_LOG.md](./FRICTION_LOG.md) | Development friction log (Amazon gives up to +10% judging bonus) |

## Development

```bash
npm test         # 219 unit tests, no network
npm run typecheck
```

## License

MIT. Public repo from day one (also qualifies for the hackathon's Open Source
mini challenge).
