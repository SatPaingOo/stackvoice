# StackVoice

**Turns your own feeds, APIs, spreadsheets, repositories and files into tools a voice assistant can call, and answers in sentences you can listen to.**

**Status:** working, preparing submission · Amazon *Build, Ship, Shape* hackathon, Alexa+ track (deadline 2026-10-23 12:00 PDT) · last reviewed 2026-10-04

> The assistant you already talk to can search the whole web, yet it cannot tell
> you what is in your own feeds, spreadsheets and data projects. StackVoice is a
> self-hosted MCP server that closes that gap. Paste a source, and the assistant
> can search it, read from it and check on it, in your words and out loud.
>
> **Before the features, the caveats.** The Alexa+ MCP Toolkit is a preview
> open to select partners only, so no hackathon entrant can connect a server to
> Alexa+, and StackVoice has not been run on a real Alexa+ device. It is
> demonstrated through a simulated Alexa+ page that calls the real server as an
> ordinary MCP client over Streamable HTTP, which the hackathon rules and FAQ
> accept.
> Speech on that page uses the browser's own speech service, which may send your
> voice to Google in Chrome or Microsoft in Edge. Your records stay on your
> server; the assistant receives only the answers it asks for.

## What it does

- **Any source becomes tools.** Paste an RSS or Atom feed, a JSON API, a CSV or
  published Google Sheet, a GitHub repository, or a file on the server.
  StackVoice reads the content, finds the records, guesses which field is the
  title, summary, date and link, and generates `search`, `read` and `status`
  tools for it.
- **Answers are spoken, not dumped.** A speaker cannot read a JSON array aloud.
  Every tool result comes back as a sentence or two a person can listen to.
- **A card for a screen.** Search, read and "what's new" results also link to
  an MCP Apps view, so a host with a screen can show the entries behind the
  spoken answer. The simulator shows it under each answer.
- **It remembers what it told you.** "What's new?" means since you last asked,
  across conversations and restarts: StackVoice keeps the newest entry it
  reported for each app and counts only what arrived after it.
- **Shortcuts you build from blocks,** like shortcuts on a phone. Say it your way
  with slots such as "news about {topic}", then Ask a tool, check the answer with
  If and Otherwise, and Say something. Each slot becomes an input the assistant
  fills.
- **A console and a CLI** to add, correct, enable and remove apps, save API keys,
  and see whether each source is healthy and fresh.
- **Built on the open standard.** MCP spec 2025-11-25 over Streamable HTTP,
  with a built-in OAuth 2.1 authorization server using PKCE (S256). Real Alexa+
  account linking also needs a client registered by hand, which is not built yet;
  see Limitations.

## Install

Node.js 22 (22.12 or later) or 24. The test runner, Vitest 5, does not support
older lines or the odd-numbered releases.

```bash
npm install
npm run dev
```

`npm run dev` compiles the console's browser code into `dist/public`, then starts
the server on http://127.0.0.1:8765. While changing files under
`src/presentation/web/client`, keep `npm run dev:client` running beside it.

Out of the box it reads two live data projects of mine,
[information-hub](https://github.com/SatPaingOo/information-hub) (177 articles on
2026-09-13, growing daily) and [eventpulse](https://github.com/SatPaingOo/eventpulse)
(event-driven market intelligence). Nothing in the demo is mocked.

## Usage

### Pages

| Route | What it is |
|---|---|
| `/` | Landing page: the idea in ten seconds, with live numbers from your stack |
| `/simulator` | Ask by voice or text, or hold a hands-free conversation; every answer shows the tool call behind it |
| `/console` | Your apps: add from any source, edit, enable, disable, remove, and see their health |
| `/console/shortcuts` | Build shortcuts from blocks and try them before saving |
| `/console/settings` | Access mode, the MCP address to connect, data sources, saved keys, server options |
| `/console/signin` | Asks for the owner token once the server is exposed beyond localhost |
| `/mcp` | The MCP endpoint itself, for any client |

Every page adapts from a phone to a desktop and needs no CDN.

### Talking to it

Open **http://127.0.0.1:8765/simulator** and ask:

> "Is my stack healthy?" · "What did you find about AI in my library?" · "Tell me more" · "News about AI" · "What's new?"

- **Push to talk.** Tap the microphone, ask one question, hear the answer.
- **Conversation.** Tap *Start a conversation* and keep talking. It listens,
  answers out loud, and listens again on its own. Say "stop" or "that's all" to
  finish. Tap the circle while it is speaking to interrupt.

It never opens the microphone while an answer is still playing, so it cannot hear
itself and loop. Two silences in a row end the conversation.

### Point it at your own data

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

**In a browser.** Open **http://127.0.0.1:8765/console**, click **Add an app**,
and paste into the dialog. StackVoice finds the records, even when an API nests
them inside its response, and shows every guess with a sample from your own data.
Records with no title of their own get one built from their columns, so a row of
gold prices reads "2026-08: 4411.000". To change a guess, click the field, then
click a column; click two columns to combine them, like `{Date}: {Price}`. Save,
and your assistant can use it in the next sentence. No restart, no YAML.

**API keys.** When a link needs a key, open **This needs an API key**, say which
header carries it (most APIs use `Authorization: Bearer …`) and paste the key.

- The key is kept in `config/secrets.yml` on the server. That file is git-ignored
  and written readable by its owner only.
- The app file only references it, as `{{secret:PROJECTS_KEY}}`, so app files can
  be shared or committed.
- The console never shows a saved key again. **Settings → Saved keys** lists them
  by name, with the apps that use each.
- Where a file is the wrong place for a key, set `STACKVOICE_SECRET_PROJECTS_KEY`
  in the environment instead. It wins over the file.

**What it refuses to read.**

- Addresses on your own machine or network (`localhost`, `192.168.x.x`, cloud
  metadata addresses), including by way of a redirect. If StackVoice runs beside
  a home server you want it to read, turn this on under **Settings → Data sources**.
- Files outside the data folder, including through a symbolic link, and a data
  folder that overlaps `config/`.
- Bodies over 5 MB, and XML that declares its own entities.

**From a terminal.**

```bash
npm run stackvoice -- app add news --from https://feeds.bbci.co.uk/news/world/rss.xml
npm run stackvoice -- app add hub --from SatPaingOo/information-hub
npm run stackvoice -- app add gold --from https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv
npm run stackvoice -- app add projects --from https://api.example.com/v1/projects \
  --header "Authorization: Bearer {{secret:PROJECTS_KEY}}"
```

The CLI prints the same guesses with samples, then writes `config/apps/<id>.yml`:

```text
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

The server watches `config/apps/` and `config/shortcuts.yml`, and reloads on its
own.

### Shortcuts

A shortcut is one tool that runs a flow of blocks. Build one on the console's
Shortcuts page:

- **Say it your way.** Write the phrases it answers to. A word in braces is a
  slot the person fills in, so "news about {topic}" answers "news about gold".
- **Add blocks.** Ask a tool, check the answer with If and Otherwise, Say a
  sentence, Get a value such as the first title, Set a name, or Stop.
- **Try it** before saving. It runs the draft with a value for each slot and
  lists every block that ran.

"News about topic" becomes the tool `news_about_topic` with a required `topic`
input, so a real assistant fills the slot and the simulator fills it from what
you said. Flows cannot loop and cannot run code. The file format is in
[CONFIGURATION.md](./CONFIGURATION.md) §7.5.

### The rest of the CLI

```bash
npm run stackvoice -- apps                 # what is configured
npm run stackvoice -- status               # is everything running, how fresh is it
npm run stackvoice -- shortcuts            # shortcuts and the tools they ask
npm run stackvoice -- app show mynotes     # the effective config
npm run stackvoice -- app validate         # check config without starting the server
npm run stackvoice -- app disable mynotes  # stop exposing it
npm run stackvoice -- app remove mynotes --yes
```

Every write validates first and backs up whatever it replaces into
`config/backups/`.

### Connecting a real assistant

The server speaks plain MCP, so any client works:

```bash
npx @modelcontextprotocol/inspector      # point it at http://127.0.0.1:8765/mcp
```

Use `127.0.0.1` rather than `localhost` for a Node.js-based client such as the
Inspector. The server listens on IPv4 only, and Node.js may resolve `localhost`
to the IPv6 address first.

An AI assistant people already use works the same way. Claude Code, for one:

```bash
claude mcp add --transport http stackvoice http://127.0.0.1:8765/mcp
```

Then ask it about your data, or for a shortcut: "news about AI" runs the
`news_about_topic` shortcut with `topic` filled. In `oauth` mode, run `/mcp` in
Claude Code and choose Authenticate: it registers itself, the consent page asks
for your owner token, and it signs in with PKCE. This was tried with Claude Code
2.1.299 on 2026-10-19, and the demo video shows it.

For anything beyond localhost, set `auth.mode` in `config/settings.yml`: `token`
for one shared bearer token, or `oauth` for the full OAuth 2.1 + PKCE flow that
Alexa+ requires. Ten wrong tokens from one address lock it out for up to 15
minutes. Behind a host's proxy, also set `server.trusted_proxies`. See
[CONFIGURATION.md](./CONFIGURATION.md) §2.

## Architecture

Clean architecture with ports and adapters. The domain and application layers
have no I/O and no SDK; adapters for GitHub, links, files, YAML and OAuth sit
behind interfaces; the MCP server, console, CLI and simulator are thin faces over
the same services. The console's browser code is framework-free TypeScript
classes. Details, key decisions and known issues are in
[ARCHITECTURE.md](./ARCHITECTURE.md).

| Doc | Covers |
|---|---|
| [FRAMEWORK.md](./FRAMEWORK.md) | Hackathon rules as verified, pitch, judging map, roadmap, risks |
| [RESEARCH.md](./RESEARCH.md) | Who else is building what, and how StackVoice differs |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers, ports and adapters, key decisions, known issues |
| [CONFIGURATION.md](./CONFIGURATION.md) | `settings.yml`, app files, source types, shortcut flows |
| [MANAGEMENT.md](./MANAGEMENT.md) | The console and CLI, and the safety rules behind both |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Where this project's rules differ from the defaults |
| [FRICTION_LOG.md](./FRICTION_LOG.md) | Where Amazon's tooling fought the build |
| [docs/devpost-submission.md](./docs/devpost-submission.md) | Draft text for the hackathon submission, and what the demo video shows |
| [DEPLOY_PLAN.md](./DEPLOY_PLAN.md) | A ready plan for a hosted copy on a free Render service, not used for the submission |

## Development

```bash
npm test          # unit tests, no network
npm run test:e2e  # browser tests against the real server, in the Edge you already have
npm run typecheck # server and browser code
npm run lint      # ESLint, with type information for src/
npm run format    # Prettier; format:check only reports
npm run build     # compile both into dist/
```

Lint also enforces the dependency rule: code in `src/domain` and
`src/application` cannot import an outer layer, an SDK or a Node.js built-in.

On 2026-10-19, 696 unit tests and 39 browser tests passed.

## Cost model

$0 by design. Every dependency is open source, the demo data is public, speech
uses the browser's built-in APIs, and the server runs on your own machine or a
free-tier VM. The only keys involved are the ones for your own services, and they
stay on your server.

## Limitations

- **Not run on a real Alexa+ device.** The Alexa+ MCP Toolkit is a preview open to select partners only. The
  server meets the Toolkit's published transport and auth requirements, but the
  end-to-end proof is the simulator, not a device.
- **The answer card has only been tried in the simulator,** which acts as an
  MCP Apps host. Whether Alexa+ renders MCP Apps views is not public.
- **The simulator's understanding is rules, not a model.** It matches phrasings
  and shortcut phrases in English. On a real device, the assistant does that part.
- **Read-only.** Nothing is ever written back to a source.
- **One source per app is searched.** An app file may list more than one source,
  but the verbs read the first.
- **Formats:** JSON, RSS, Atom and CSV. No spreadsheets in Excel format, PDFs or
  scraped web pages.
- **Freshness for links and files** is the newest date among the records. Only
  GitHub sources report a last run, from GitHub Actions.
- **Alexa+ account linking is not supported yet.** Alexa+ links only to a
  client registered by hand on the authorization server, with a client secret,
  every Alexa redirect URI and refresh tokens. StackVoice supports only Dynamic
  Client Registration, which MCP spec 2025-11-25 keeps for backwards
  compatibility. Pre-registered clients and Client
  ID Metadata Documents, the spec's other two mechanisms, are not built.
- **One owner.** Access is one owner token, and the simulator stands down in
  `oauth` mode. Registered clients and their refresh tokens survive a restart in
  `config/oauth.json`; deleting that file while the server is stopped signs
  every client out.
- **Latency.** Tools answered in 40–180 ms with a warm cache on 2026-09-12. The
  cache is warmed at startup, but a cold fetch from GitHub is slower than the
  Alexa+ budget of 500 ms.
- **English only,** in the pages and in spoken answers.

## License

MIT. See [LICENSE](./LICENSE).

---

Last reviewed: 2026-10-04
