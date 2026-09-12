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

`npm run dev` compiles the console's browser code into `dist/public` first. While changing files under
`src/presentation/web/client`, keep `npm run dev:client` running beside it.

Open **http://localhost:8765/simulator** and ask it something:

> "Is my stack healthy?" · "What did you find about AI in my library?" · "Tell me more" · "News about AI"

That page is a simulated Alexa+ client. It talks to the MCP server over the same
Streamable HTTP transport a device would use, and shows every tool call it makes
underneath the answer. Speech in and out use your browser's built-in speech
features, which may send your voice to the browser maker's speech service —
Google in Chrome, Microsoft in Edge. Your records never leave your server.

Out of the box it is pointed at two real, live pipelines —
[information-hub](https://github.com/SatPaingOo/information-hub) (177 verified
articles, growing daily) and [eventpulse](https://github.com/SatPaingOo/eventpulse)
(event → market intelligence). Nothing in the demo is mocked.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page — the idea in ten seconds, with the live numbers from your stack |
| `/simulator` | Ask by voice or text, or hold a hands-free conversation; every answer shows the tool call behind it |
| `/console` | Your apps — add, edit, enable, disable, remove, and see their health |
| `/console/shortcuts` | Build one tool that runs several |
| `/console/settings` | Access mode, the MCP address to connect, which pages are on, server options |
| `/mcp` | The MCP endpoint itself, for any client |

Every page is rendered by the server with no build step and no CDN, and each one
adapts from a phone to a desktop.

## Talking to it

The simulator has two ways in.

- **Push to talk.** Tap the microphone, ask one question, hear the answer.
- **Conversation.** Tap *Start a conversation* and just keep talking. It
  listens, answers out loud, and listens again on its own. Say "stop" or
  "that's all" to finish, or tap *End conversation*. Tap the circle while it is
  speaking to interrupt.

It never opens the microphone while an answer is still playing, so it cannot
hear itself and loop. Two silences in a row end the conversation rather than
leaving a microphone open on an empty room.

## Point it at your own data

Anything that publishes records works. Paste it into one box and StackVoice
works out what it is:

| You have | Paste |
| --- | --- |
| A news site, blog, podcast or YouTube channel | its RSS or Atom feed link |
| An API that answers with JSON | its address, plus a key if it needs one |
| A Google Sheet, or any CSV | the CSV link (File → Share → Publish to web → CSV) |
| A data project on GitHub | `owner/repo`, or its github.com link |
| A file on the server | its name inside the `data/` folder |

The format is read from the content, not from the address or what the server
claims, so a spreadsheet served as plain text or a feed without `.xml` in its
name still works. A link to an ordinary web page is refused with a hint to look
for its feed instead.

### In a browser

Open **http://localhost:8765/console**, click **Add an app**, and paste into the dialog that opens. StackVoice
fetches it, finds the records, even when an API nests them inside its response,
and works out which field is the title, the summary, the date and the link.
Records with no title of their own get one built from their columns, so a row of
gold prices reads "2026-08: 4411.000".

Every guess is shown with a sample from your own data. To change one, click the
field, then click a column; click two columns to combine them, like
`{Date}: {Price}`. Then Save. Your assistant can use it in the next sentence. No
restart, no YAML, no terminal.

The same page lists what you have, shows whether each app is healthy and how
fresh its data is, and lets you edit, disable or remove any of them. When the
server is exposed beyond localhost it asks for your `auth.token` first.

### API keys

When a link needs a key, open **This needs an API key**, say which header carries
it (most APIs use `Authorization: Bearer …`) and paste the key.

- The key is kept in `config/secrets.yml` on the server. That file is git-ignored
  and written readable by its owner only.
- The app file only references it, as `{{secret:PROJECTS_KEY}}`, so app files can
  be shared or committed.
- The console never shows a saved key again. **Settings → Saved keys** lists them
  by name, with the apps that use each.
- Where a file is the wrong place for a key, set `STACKVOICE_SECRET_PROJECTS_KEY`
  in the environment instead. It wins over the file.

### What it refuses to read

- Addresses on your own machine or network (`localhost`, `192.168.x.x`, cloud
  metadata addresses), including by way of a redirect. If StackVoice runs beside
  a home server you want it to read, turn this on under **Settings → Data sources**.
- Files outside the data folder, including through a symbolic link, and a data
  folder that overlaps `config/`.
- Bodies over 5 MB, and XML that declares its own entities.

### From a terminal

```bash
npm run stackvoice -- app add news --from https://feeds.bbci.co.uk/news/world/rss.xml
npm run stackvoice -- app add hub --from SatPaingOo/information-hub
npm run stackvoice -- app add gold --from https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv
npm run stackvoice -- app add projects --from https://api.example.com/v1/projects \
  --header "Authorization: Bearer {{secret:PROJECTS_KEY}}"
```

Same inference, same output:

```
  Looking at https://feeds.bbci.co.uk/news/world/rss.xml…
  Found 25 records in this RSS under "items".

  Field mapping (inferred)
  FIELD    FROM       EXAMPLE
  key      id         https://www.bbc.co.uk/news/articles/c14dpgm0rg4o#0
  title    title      Anthropic boss Dario Amodei calls for AI development to s...
  summary  summary    The call comes amid growing concerns that AI models may b...
  date     date       2026-09-12T17:42:38.000Z
  topic    not found  -
  region   not found  -
  url      link       https://www.bbc.co.uk/news/articles/c14dpgm0rg4o?at_mediu...

  Status counts the records and reads the newest date

  ✓ wrote config/apps/news.yml

  New tools once the server picks it up: news_search, news_read, news_status
```

Any guess that is wrong is one line to change in the generated file. The server
watches `config/apps/` and reloads on its own.

## Shortcuts

A shortcut is one tool that runs a flow of blocks, like a shortcut on a phone.
Build one on the console's Shortcuts page:

- **Say it your way.** Write the phrases it answers to. A word in braces is a
  slot the person fills in, so "news about {topic}" answers "news about gold".
- **Add blocks.** Ask a tool, check the answer with If and Otherwise, Say a
  sentence, Get a value such as the first title, Set a name, or Stop.
- **Try it** before saving. It runs the draft with a value for each slot and
  lists every block that ran.

Each shortcut becomes one tool. "News about topic" becomes `news_about_topic`
with a required `topic` input, so a real assistant fills the slot and the
simulator fills it from what you said. The file format is in CONFIGURATION.md §7.5.

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
npm test          # 226 unit tests, no network
npm run test:e2e  # browser tests against the real server, in the Edge you already have
npm run typecheck
```

## License

MIT. Public repo from day one (also qualifies for the hackathon's Open Source
mini challenge).
