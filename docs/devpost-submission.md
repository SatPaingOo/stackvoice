# Devpost submission draft

Draft text for the hackathon submission form, kept beside the code so it changes
with the product. The pitch itself is owned by FRAMEWORK.md §2; the evidence for
what separates StackVoice is in RESEARCH.md §8. Rule references are to the
official rules as checked on 2026-09-13.

## Form fields

| Field | Value |
|---|---|
| Project name | StackVoice |
| Tagline | Your own feeds, APIs and spreadsheets as tools your voice assistant can call, with answers you can listen to |
| Primary track | Alexa+ |
| Mini challenge | Open Source |
| Built with | TypeScript, Node.js, Model Context Protocol TypeScript SDK, Streamable HTTP, OAuth 2.1, Express, zod, Web Speech API, Playwright |
| Repository | https://github.com/SatPaingOo/stackvoice (make public before submitting) |
| Demo video | To record; see the outline below |
| Try it | To host; see FRAMEWORK.md §7 Stage 7 |

## About the project

### Inspiration

I run two data pipelines of my own. One collects and verifies deep-dive
articles, the other explains why gold, oil and stocks moved. My assistant can
search the whole internet, yet it cannot tell me what my own pipeline found last
night. Every assistant I use has the same blind spot: the data that is actually
mine.

### What it does

StackVoice is a self-hosted MCP server that gives the assistant you already talk
to hands on your own data.

- **Paste any source.** An RSS or Atom feed, a JSON API, a CSV or published
  Google Sheet, a GitHub repository, or a file on the server. StackVoice reads the
  content, finds the records, guesses the title, summary, date and link, and
  shows each guess with a real sample. Fix a guess by clicking a column. Save, and
  the assistant has `search`, `read` and `status` tools for it.
- **Hear the answer.** Tool results come back as a sentence or two, with dates
  said as "yesterday", because a speaker cannot read a JSON array aloud.
- **Build voice shortcuts.** Like shortcuts on a phone: write "news about
  {topic}", add blocks to Ask a tool, check the answer with If and Otherwise, and
  Say something. The slot becomes an input the assistant fills. Try it before
  saving and see every block that ran.
- **Keep keys safe.** API keys stay on the server and are referenced by name.
  The browser never sees one again.

The project is demonstrated through a simulated Alexa+ page, because the Alexa+
MCP Toolkit is available in the US only. The simulator is a real MCP client: it
calls the server over Streamable HTTP, as a device would, and shows each tool
call under the answer.

### How we built it

- TypeScript on Node.js, with the official MCP TypeScript SDK, implementing MCP
  spec 2025-11-25 over Streamable HTTP.
- Clean architecture with ports and adapters. The core has no I/O and no SDK;
  GitHub, links, files, YAML and OAuth are adapters behind interfaces.
- A built-in OAuth 2.1 authorization server with PKCE (S256), metadata discovery
  and a 401 challenge, because the Alexa+ MCP Toolkit requires it.
- One reader for every source type that detects the format from the body, plus a
  network guard, because a pasted link is a request the server makes on the
  user's behalf.
- Shortcut flows as six fixed blocks and an interpreter, with no user code.
- A console built from framework-free TypeScript component classes.
- 605 unit tests and 38 browser tests on 2026-09-13.

### Challenges we ran into

- **Speakable answers.** Every early result was correct and unlistenable. A
  response shaper now enforces a word budget, says dates in words and reads at
  most three titles.
- **Guessing fields in data nobody described.** The longest list in a document
  is often the wrong one: eventpulse publishes 39 price rows beside 10 events.
  The inspector picks the most readable list instead.
- **A pasted link is a server-side request.** It could reach a private network or
  a cloud metadata address, directly or through a redirect or an IPv4-mapped IPv6
  address. Every hop is now checked.
- **Speech recognition that asks twice.** Edge can deliver one spoken question as
  two result events. Browser tests with fake speech events reproduced it, and each
  question is now asked exactly once.
- **Latency.** Alexa+ allows 500 ms. The cache is warmed at startup so a tool call
  rarely waits on GitHub.

### Accomplishments that we're proud of

- A person with only a feed link, and no API spec, gets working voice tools from
  one paste.
- "News about {topic}" works by voice end to end: phrase, slot, flow, spoken
  answer, over real MCP.
- An honest demo. Nothing is mocked, and every answer shows the call behind it.

### What we learned

The transport is the easy half. Nobody's first MCP server returns speakable
results, and the constraint that mattered most, that a spoken answer is two
sentences and not an array, only showed up by building a client and listening.

### What's next

- Onboarding to real Alexa+ once the MCP Toolkit is available where I can use it.
- Reading more than one source per app.
- Pages and answers in Burmese as well as English.

## Work that existed before the submission period

The submission period began 2026-08-31 10:15 PDT.

| Part | Created | Relationship to this entry |
|---|---|---|
| StackVoice | Planning notes from 2026-09-05; first commit 2026-09-12 | This entry. All code was written during the submission period |
| [eventpulse](https://github.com/SatPaingOo/eventpulse) | 2026-09-03 | A separate project, used only as demo data |
| [information-hub](https://github.com/SatPaingOo/information-hub) | 2026-08-13, before the period | A separate project, used only as demo data. Not part of this entry |

## Demo video outline

Under 3 minutes, in English, public on YouTube or Vimeo. The rules require
footage of the project working, and forbid third-party trademarks and copyrighted
music without permission. Say on screen that the Alexa+ experience is simulated.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | The landing page | "My assistant can search the internet, but not my own data." |
| 0:15–0:50 | The simulator: "Is my stack healthy?", "What did you find about AI in my library?", "Tell me more" | That this is a simulated Alexa+ client calling a real MCP server; point at the tool call under each answer |
| 0:50–1:30 | The console: add a source you own, such as a CSV in the data folder or eventpulse; fix one guess by clicking a column; save | "No spec, no code. Paste it, check it, save." |
| 1:30–2:15 | The shortcut builder: "news about {topic}" with an If; Try it; then ask it by voice | That the slot becomes a tool input a real assistant fills |
| 2:15–2:40 | The tool list in an MCP client showing the `topic` input; the OAuth metadata endpoint | Spec 2025-11-25, Streamable HTTP, OAuth 2.1 with PKCE |
| 2:40–2:55 | The repository | Self-hosted, $0, MIT |

Keep news sites, other companies' logos and their headlines off screen.

## Testing instructions

Text for the form's testing instructions field. There is no hosted server yet, so
these run StackVoice locally. When it is hosted, put the link and the console
token at the top and keep the rest.

### Run it

You need Node.js 20 or later, Git, and an internet connection: the two demo apps
read public data from GitHub. For voice, use Chrome or Edge; typing works in any
browser.

```bash
git clone https://github.com/SatPaingOo/stackvoice.git
cd stackvoice
npm ci
npm run dev
```

Wait for the log line `stackvoice listening`. The server is at
http://127.0.0.1:8765 and asks for no sign-in, because it listens on localhost
only.

### 1. Ask it something

Open http://127.0.0.1:8765/simulator and type, or tap the microphone and say:

| Say | What runs |
|---|---|
| Is my stack healthy? | `stack_status` |
| What did you find about AI in my library? | `library_search` with the query `ai` |
| Tell me more | `library_read` for the first result |
| News about AI | The shortcut `news_about_topic`, with `topic` filled from what you said |

Under each answer is the tool call that produced it, with its arguments and how
long it took. This page is a simulated Alexa+ client: it calls the server's own
`/mcp` endpoint over Streamable HTTP, as a device would. For a hands-free
conversation, tap **Start a conversation**, and say "stop" to end it.

### 2. Add a source of your own

1. Open http://127.0.0.1:8765/console and click **Add an app**.
2. Click the **News feed** example, or paste any RSS feed, JSON API or CSV link.
3. Click **Look at it**. Every guessed field shows a sample from the data.
4. Optional: click a field, then click a column to change it.
5. Click **Save app**. The card shows the new tools.
6. In the simulator, ask "Is my BBC News app healthy?", or ask about a word you
   can see in one of its headlines.

### 3. Build a voice shortcut

1. Open http://127.0.0.1:8765/console/shortcuts and click **Add a shortcut**.
2. Name it `quick news`, and write the phrase `quick news about {topic}`.
3. Click **Ask**. It starts on `library_search`, searching for `{topic}`, saved as
   `answer`.
4. Click **If**. It starts as "how many entries `answer` has is exactly 0". Under
   **Then**, add **Say** with `Nothing about {topic} yet.`, and add **Stop**.
5. Under the If, add **Say** with
   `{answer.count} results. The first is {answer.first.title}.` The **Insert**
   menu beside the field offers these names.
6. In **Try it**, type `AI` for `{topic}` and click **Try it**. The answer and every
   block that ran appear.
7. Click **Save shortcut**, then say "quick news about AI" in the simulator.

### 4. Check it as an MCP server

```bash
npx @modelcontextprotocol/inspector
```

Choose the Streamable HTTP transport, connect to http://127.0.0.1:8765/mcp, and
list the tools. `news_about_topic` has a required `topic` input.

### 5. Optional: OAuth 2.1

Stop the server, and in `config/settings.yml` set `auth.mode: oauth`, a
`token` of your choice, and `public_url: "http://127.0.0.1:8765"`. Start it again.

```bash
curl http://127.0.0.1:8765/.well-known/oauth-authorization-server
curl -i http://127.0.0.1:8765/mcp
```

The first lists `S256` as the PKCE method. The second returns `401` with a
`WWW-Authenticate` header. The simulator stands down in this mode by design,
because an authorization code flow needs a person at a browser.

### Worth knowing

- Use `127.0.0.1` rather than `localhost`. The server listens on IPv4 only, and
  Node.js-based clients such as the MCP Inspector may resolve `localhost` to the
  IPv6 address first and fail to connect.
- StackVoice has not run on a real Alexa+ device; the Alexa+ MCP Toolkit is
  US-only. The simulator is the demonstration.
- Voice uses the browser's own speech service, which may send audio to Google in
  Chrome or Microsoft in Edge.
- The demo apps call GitHub without a key. GitHub allows 60 such requests an
  hour, and answers are cached for five minutes, so a long session may briefly
  show a source as unavailable.
- `npm test` runs the unit tests with no network. `npm run test:e2e` runs the
  browser tests and needs Microsoft Edge installed.

## Still to write

- **Product feedback** (required): which Amazon tools, APIs and SDKs were used and
  for what, what worked, what needs work, onboarding, and whether I would build
  with them again. Draw on FRICTION_LOG.md.
- **The hosted link and console token**, added to the testing instructions once
  the server is hosted.
- **Gallery images** for the project page.
