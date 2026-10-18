# Devpost submission draft

Draft text for the hackathon submission form, kept beside the code so it changes
with the product. The pitch itself is owned by FRAMEWORK.md §2; the evidence for
what separates StackVoice is in RESEARCH.md §8. Rule references are to the
official rules as checked on 2026-10-04.

## Form fields

| Field | Value |
|---|---|
| Project name | StackVoice |
| Tagline | Your own feeds, APIs and spreadsheets as tools your voice assistant can call, with answers you can listen to |
| Primary track | Alexa+ |
| Mini challenge | Open Source |
| Built with | TypeScript, Node.js, Model Context Protocol TypeScript SDK, Streamable HTTP, OAuth 2.1, Express, zod, Web Speech API, Playwright |
| Repository | https://github.com/SatPaingOo/stackvoice (make public before submitting) |
| Demo video | Recorded 2026-10-19 (2:58, narrated); upload it, then put the link here. See Demo video below |
| Try it | Not hosted: the hackathon FAQ says a locally runnable public repository and the video are enough. Run it with the testing instructions |

## About the project

### Inspiration

I run two data pipelines of my own. One collects and verifies deep-dive
articles, the other explains why gold, oil and stocks moved. My assistant can
search the whole internet, yet it cannot tell me what my own pipeline found last
night. Every assistant I use has the same blind spot: the data that is actually
mine.

### What it does

StackVoice is a self-hosted MCP server that gives the assistant you already talk
to hands on your own data. It is not a wrapper around one API. A wrapper exposes
an API it was written for, as it is; StackVoice starts from whatever data you
have, with no spec, and adds five things a wrapper does not.

- **Any source becomes tools, with no spec and no code.** Paste an RSS or Atom
  feed, a JSON API, a CSV or published Google Sheet, a GitHub repository, or a
  file on the server. StackVoice reads the content, finds the records, guesses
  the title, summary, date and link, and shows each guess with a real sample.
  Fix a guess by clicking a column. Save, and the assistant has `search`, `read`
  and `status` tools for it, with no restart.
- **Answers made for listening.** A speaker cannot read a JSON array aloud. Every
  tool result comes back as a sentence or two, at most three titles, with dates
  said as "yesterday".
- **Workflows across your apps, built in your own words.** Like shortcuts on a
  phone: write "news about {topic}", then add blocks that Ask any tool from any
  app, check the answer with If and Otherwise, and Say something. The slot
  becomes an input the assistant fills, and Try it shows every block that ran.
  Six fixed blocks, so there is no user code to sandbox.
- **A card for a screen.** Results also link to an MCP Apps view, so a host
  with a screen can show the entries behind the spoken answer. The simulator
  shows it under each answer, acting as an MCP Apps host.
- **It remembers across conversations.** "What's new?" means since you last
  asked: StackVoice keeps the newest entry it reported for each app, across
  conversations and restarts, and counts only what arrived after it.

API keys stay on the server and are referenced by name; the browser never sees
one again.

The project is demonstrated through a simulated Alexa+ page, because the Alexa+
MCP Toolkit is a preview open to select partners only, so no entrant can
connect a server to Alexa+. The simulator is a real MCP client: it calls the
server over Streamable HTTP, as a device would, and shows each tool call under
the answer.

The same server works in an AI assistant people already use. Claude Code
connected to it as an ordinary MCP client: it registered itself, signed in
through StackVoice's OAuth 2.1 with PKCE, and ran the "ideas about" shortcut
when asked for video ideas about AI. The video shows it.

### How we built it

- TypeScript on Node.js, with the official MCP TypeScript SDK, implementing MCP
  spec 2025-11-25 over Streamable HTTP.
- Clean architecture with ports and adapters. The core has no I/O and no SDK;
  GitHub, links, files, YAML, OAuth and the remembered state are adapters
  behind interfaces.
- A built-in OAuth 2.1 authorization server with PKCE (S256), metadata discovery
  and a 401 challenge, because the Alexa+ MCP Toolkit requires it. Registered
  clients and refresh tokens, stored as digests, survive a restart.
- One reader for every source type that detects the format from the body, plus a
  network guard, because a pasted link is a request the server makes on the
  user's behalf.
- Shortcut flows as six fixed blocks and an interpreter, with no user code.
- "What's new" as one remembered date per app, in a small file that survives a
  restart.
- The answer card as an MCP Apps view (spec 2026-01-26), written without the SDK:
  the view and the simulator's host side speak the extension's JSON-RPC over
  `postMessage`, and the view runs in a sandboxed iframe that loads nothing
  from the network.
- A console built from framework-free TypeScript component classes.
- 696 unit tests and 39 browser tests on 2026-10-19.

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
- **A real client finds what your own does not.** Connecting Claude Code turned
  up three problems the simulator never hit. A shortcut's spoken answer was
  missing from its structured result, which Claude Code reads in place of the
  text. The consent page, shown again after a wrong owner token, lost the OAuth
  parameters, so the next approval failed. And a restart forgot every
  registered client while Claude Code kept its registration, so it could not
  sign in again. Registered clients and refresh tokens now outlive a restart,
  and all three are covered by tests.

### Accomplishments that we're proud of

- A person with only a feed link, and no API spec, gets working voice tools from
  one paste.
- "News about {topic}" works by voice end to end: phrase, slot, flow, spoken
  answer, over real MCP.
- "What's new?" tomorrow tells you only what arrived since today, even after the
  server restarted.
- An honest demo. Nothing is mocked, and every answer shows the call behind it.
- An AI assistant that already exists, Claude Code, signs in through
  StackVoice's own OAuth server and uses a shortcut built without code.

### What we learned

The transport is the easy half. Nobody's first MCP server returns speakable
results, and the constraint that mattered most, that a spoken answer is two
sentences and not an array, only showed up by building a client and listening.

### What's next

- Onboarding to real Alexa+ once the MCP Toolkit opens beyond its partner preview.
- Statically registered OAuth clients, which Alexa+ account linking requires.
- Trying the answer card in other MCP Apps hosts, and on Alexa+ devices with a
  screen once that is possible.
- Reading more than one source per app.
- Pages and answers in Burmese as well as English.

## Work that existed before the submission period

The submission period began 2026-08-31 10:15 PDT.

| Part | Created | Relationship to this entry |
|---|---|---|
| StackVoice | Planning notes from 2026-09-05; first commit 2026-09-12 | This entry. All code was written during the submission period |
| [eventpulse](https://github.com/SatPaingOo/eventpulse) | 2026-09-03 | A separate project, used only as demo data |
| [information-hub](https://github.com/SatPaingOo/information-hub) | 2026-08-13, before the period | A separate project, used only as demo data. Not part of this entry |

## Demo video

Recorded on 2026-10-19 from the production build, driven by a script rather
than by hand, then edited with narration: 2 minutes 58 seconds, 1920x1080, in
English. The file to upload is `final/stackvoice-demo-narrated.mp4` in
`../StackVoice-video`, with `final/stackvoice-demo-narrated.srt` as its English
subtitles (the narration and the simulator's answers). The recorder, the editing
project and the files live outside this repository; see that folder's README.
Upload it to YouTube or Vimeo as public; the rules require one or the other. A
version without narration, captions burned in (2:51), is there too as
`final/stackvoice-demo.mp4`.

| Time | Scene | What it shows |
|---|---|---|
| 0:00 | Landing page | The idea, and how sources reach the assistant |
| 0:08 | Console | Adding `video-ideas.csv` from the data folder: every guess with an example, the missing date fixed by clicking a column, the read tool switched on, saved |
| 0:33 | Simulator | "Is my stack healthy?", a search of the new app, and "Tell me more"; the search and the read each show an MCP Apps card with the entries, and every answer its tool call |
| 1:15 | Shortcut builder | "ideas about {topic}": Ask, If with a Say and a Stop, Say; Try it with "gardening" (the If answers) and with "AI"; saved |
| 1:52 | Simulator | "Ideas about AI" routed to the shortcut, with `topic` filled |
| 2:04 | Simulator | "What's new in my video ideas?" starts tracking; a new idea is added to the CSV; in a new conversation the same question names only that idea, with its card |
| 2:34 | Claude Code | An AI assistant people already use, signed in through StackVoice's OAuth, runs the "ideas about" shortcut with `topic: "AI"` and answers from what it says. The terminal session as it ran, fast-forwarded through the waiting |
| 2:41 | The same server in `oauth` mode | Its real authorization server metadata with S256, and a 401 for `/mcp` without a token |
| 2:50 | End card | The repository address, MIT, self-hosted, $0 |

What the rules ask of it, and how it answers:

- **The simulated experience is clear.** Both simulator scenes carry a
  "Simulated Alexa+ experience" label. The narration says a simulated Alexa+
  client asks over real MCP, and a headline repeats it on screen.
- **No third-party trademarks or music.** The data searched on screen is a CSV
  of the author's own video ideas. The landing page is cut before its example
  names a news site, and the library and market apps, whose records name other
  companies, are not searched. The music was written for this video by the
  author's own video tool, ReelSmith; it is not a third-party track, and it is
  silent while the simulator answers.
- **The voices** are synthetic. The narration is an English text-to-speech
  voice (edge-tts, Andrew). The answers are Windows' built-in Zira voice,
  standing in for the browser's speech, which the recording cannot capture.
- **An existing AI assistant app,** which the FAQ calls a nice bonus. The Claude
  Code scene is a recording of its own terminal output, played back at its
  recorded pace with the waits shortened. Nothing in it was changed.

## Testing instructions

Text for the form's testing instructions field. They run StackVoice locally: the
hackathon FAQ says a locally runnable public repository plus the demo video is
enough, and hosting is not required.

### Run it

You need Node.js 22 (22.12 or later) or 24, Git, and an internet connection: the two demo apps
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

### 6. Optional: an AI assistant you already have

Any MCP client works. With Claude Code:

```bash
claude mcp add --transport http stackvoice http://127.0.0.1:8765/mcp
```

Ask it "news about AI": it runs the `news_about_topic` shortcut with `topic`
filled. With the server in `oauth` mode from step 5, run `/mcp` in Claude Code
and choose Authenticate first: it registers itself, and the consent page in the
browser asks for the owner token. A restart of StackVoice does not sign it out:
the registration and the refresh token are kept in `config/oauth.json`.

### Worth knowing

- Use `127.0.0.1` rather than `localhost`. The server listens on IPv4 only, and
  Node.js-based clients such as the MCP Inspector may resolve `localhost` to the
  IPv6 address first and fail to connect.
- StackVoice has not run on a real Alexa+ device; the Alexa+ MCP Toolkit is a
  preview open to select partners only. The simulator is the demonstration.
- Voice uses the browser's own speech service, which may send audio to Google in
  Chrome or Microsoft in Edge.
- The demo apps call GitHub without a key. GitHub allows 60 such requests an
  hour, and answers are cached for five minutes, so a long session may briefly
  show a source as unavailable.
- `npm test` runs the unit tests with no network. `npm run test:e2e` runs the
  browser tests and needs Microsoft Edge installed.

## Product feedback

Text for the required product feedback field. The author never used the Alexa+
developer tools, because they are partner-only, and the answers say so.

**Which developer tools, APIs and SDKs did you use, and for what?** None of
Amazon's. The Alexa+ MCP Toolkit, its CLI and its web simulator are a preview
for select partners, so I could not use them. StackVoice is built on the open
MCP specification 2025-11-25 and the MCP TypeScript SDK, and it is shown through
the hackathon's simulated Alexa+ path.

**What worked well?** The hackathon accepting a simulated Alexa+ experience, and
the FAQ saying so clearly, which made it possible to take part without access.
Building on the open MCP standard meant the server could be tested with any MCP
client.

**What needs work?**
- Access. An entrant has no way to try an add-on with Alexa+, even text-only, so
  nothing in this project was checked against Alexa+ itself.
- Who can use the tools. That they are partner-only was not clear from the setup
  pages; it became clear from the hackathon FAQ.
- Requirements in one place. What a server must meet for Alexa+, such as the
  pre-registered OAuth client that account linking needs, is spread across
  several pages.

**How was your onboarding experience?** There was none on Alexa+: access is
partner-only, so I never reached a hello world with it.

**Would you build with these devices and services again?** I cannot say yet. I
never got to use the Alexa+ tools, so I have no experience of them to judge by.

## Open Source mini challenge

The rules ask for a contribution URL, the project repository URL, a GitHub
username, and what was done, how it works and why it matters. They describe the
challenge as "a new, additional open-source project" or a contribution to a
public repository, so confirm with Devpost that the entry's own repository
counts before relying on this (FRAMEWORK.md §8, risk 7).

| Field | Value |
|---|---|
| Contribution URL | https://github.com/SatPaingOo/stackvoice |
| Project repository URL | https://github.com/SatPaingOo/stackvoice |
| GitHub username | SatPaingOo |

**What I did.** Wrote StackVoice from its first commit during the submission
period and published it under the MIT license, with its tests, docs and a
browser test suite.

**How it works.** A self-hosted MCP server reads a pasted feed, API, spreadsheet,
repository or file, infers which fields are the title, summary, date and link,
and exposes `search`, `read` and `status` tools for it. Answers are shaped into
sentences for speech. Shortcuts run fixed blocks, never user code.

**Why it matters.** Anyone with data of their own can give an MCP assistant
access to it without writing a server. The parts are reusable on their own: the
source inspector, the speakable response shaper, the network guard against
server-side request forgery, and the flow interpreter.

## Feature requests

Optional field. Each request needs a description, why it matters to this
project, and a priority. Draft; change anything that does not match your own
experience.

1. **A way to try MCP add-ons with Alexa+ outside the partner preview.** Even a
   text-only test console would do. Without one, routing, spoken answers and
   real latency could not be checked, and the project is shown through a
   simulator.
   **Critical.**
2. **Every add-on requirement on one page.** That the tools are a partner-only
   preview, the transport, OAuth with PKCE, the client registration mechanism,
   the full list of Alexa redirect URIs and the 500 ms budget are spread across
   the docs home page, the quickstart and the account linking page today. The
   registration requirement was found after the authorization server was
   built, and the partner gate only from the hackathon FAQ. **Important.**
3. **Guidance on tool results for voice.** How long a result can be before it
   stops being listenable, and how tool descriptions are used to route a
   request. StackVoice had to guess at both. **Nice-to-have.**

## Gallery images

Seven 2400x1600 PNGs (3:2, as Devpost suggests) in `../StackVoice-video/gallery`:
the landing page, the simulator with three answers and their tool calls, the
apps page, the add dialog with its guesses, the shortcut builder's blocks and
Try it, and "what's new" before and after a new idea arrives.
