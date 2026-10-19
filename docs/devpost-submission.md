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
| Repository | https://github.com/SatPaingOo/stackvoice (public, MIT) |
| Demo video | https://youtu.be/che6nlzd_SA (2:58, narrated, public on YouTube since 2026-10-19). See Demo video below |
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
It is public on YouTube at https://youtu.be/che6nlzd_SA, as the rules require (YouTube or Vimeo). A
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

For the form's testing instructions field: paste the text of
[try-it.md](./try-it.md) from "Run it" on. That file is the one source for these
steps, and the README links to it. The hackathon FAQ says a locally runnable
public repository plus the demo video is enough, and hosting is not required.

## Product feedback

Text for the required product feedback field. The author never used the Alexa+
developer tools, because they are partner-only, and the answers say so.

**Which developer tools, APIs and SDKs did you use, and for what?** No Amazon
tool, API or SDK: the Alexa+ MCP Toolkit, its CLI and its web simulator are a
preview for select partners, so I could not use them. What the project did use:

- Amazon's documentation: the Alexa+ MCP Toolkit overview and quickstart and
  the "Account Linking for MCP Add-ons" page, to build the server to the
  requirements Alexa+ states (Streamable HTTP, OAuth 2.1 with PKCE, the 500 ms
  budget), and the hackathon FAQ, to confirm the simulated path.
- The open Model Context Protocol (spec 2025-11-25) and the official MCP
  TypeScript SDK, for the Streamable HTTP server, the tools, and the OAuth
  authorization server with dynamic client registration.
- A simulated Alexa+ client I built myself, a real MCP client in the browser, as
  the rules allow.
- Claude Code as a second MCP client, to check the server against an assistant
  I did not write.

**What worked well?**

- Alexa+ documentation: once found, the quickstart is concrete. Transport,
  OAuth 2.1 with PKCE (S256), the metadata endpoint and the 500 ms budget are
  stated as hard requirements, so the server could be built to them without
  guessing. The account linking page is just as specific about what a client
  needs.
- The hackathon FAQ: it says plainly that a simulated Alexa+ experience is
  accepted and what that means, which made it possible to take part without
  access to the tools.
- MCP TypeScript SDK: Streamable HTTP and the authorization router (metadata,
  dynamic registration, PKCE checks, the 401 challenge) worked from the start
  and were reliable in testing. Building on the open standard meant the server
  could be tested with any MCP client, Claude Code included.

**What needs work?**

- Access (tool limitation): an entrant has no way to try an add-on with Alexa+,
  not even a text-only console, so routing, spoken answers and the 500 ms
  budget could not be checked against Alexa+ itself.
- Who can use the tools (docs): the partner-only status is on the add-ons home
  page but missing from the setup pages, and it became clear to me only from the
  hackathon FAQ.
- Requirements spread across pages (docs sections): the Toolkit overview does
  not mention authentication, OAuth 2.1 with PKCE and the 500 ms budget appear
  only in the quickstart, and that account linking needs a statically
  registered client ("Dynamic Client Registration (DCR) isn't supported")
  appears only on the account linking page. My server was built around dynamic
  registration before I found it, so pre-registered clients are still a gap.
- Discoverability: the Alexa+ track on the hackathon page did not link the
  Toolkit docs, so the first week was designed against the open MCP spec alone.

**How was your onboarding experience?** For Alexa+ there was none: access is
partner-only, so I never reached a hello world with Alexa+. Onboarding was the
documentation alone, and getting from zero to a complete list of requirements
took longer than it should have, because they are spread over three pages that
the track did not link. On the open MCP side, hello world was quick: a Streamable
HTTP server answering its first tool call on the first day of building.

**Would you build with these devices and services again?** (The form asks for
Yes or No, then why.) Yes, once I can use them. I cannot judge the Alexa+ tools
themselves yet, because I never got to use them. But voice is where my own data
is most useful to me, and what Alexa+ asks of a server builds on the open MCP
standard StackVoice already uses. Connecting it to Alexa+ is the first thing on
its roadmap once entrants can, and the first thing I would ask for is a way to
test an add-on without partner access.

## Open Source mini challenge

Answer **Yes**. The form asks for a contribution URL, the project repository
URL, a GitHub username, and what was done, how it works and why it matters. It
also settles what counts: "Contributions can be a new repo (with open-source
license)". StackVoice is a new repository, first committed during the window
and licensed MIT.

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

## The form's other questions

In the order the form asks them, around the Open Source and product feedback
answers above.

**Upload a file.** `StackVoice-friction-log.pdf`, made from
[FRICTION_LOG.md](../FRICTION_LOG.md) by `../StackVoice-video/submission/friction-pdf.mjs`.
The form has no field of its own for the friction log, and the rules give it up
to a 10% bonus.

**Is your project new or existing prior to August 31, 2026?** New.

**If you are submitting an existing project, explain what you updated.** Not
applicable: StackVoice is a new project. Its planning notes date from 2026-09-05
and its first commit from 2026-09-12, and all of its code was written during the
submission period. Two earlier projects of mine appear in it only as demo data:
information-hub (created 2026-08-13, before the period) and eventpulse (created
2026-09-03). Neither is part of this entry.

**Are you submitting for the AWS Builder Mini Challenge?** No.

**AWS Builder Mini Challenge: which AWS services did you incorporate and how?**
Not applicable: StackVoice uses no AWS services. It runs on the owner's own
machine.

**Which AI tools have you leveraged while working on this project?** Claude
Code, Anthropic's AI coding assistant, was my main tool. I used it to research
the hackathon rules and the MCP specification, plan the architecture, write and
test most of the code, and draft the docs. I set the direction, made the product
decisions and checked the results. Claude Code also appears in the demo as an
MCP client calling StackVoice. For the demo video, the narration is edge-tts, a
free neural text-to-speech voice, and the video was edited with ReelSmith, my
own video tool, driven by Claude Code. No AI model generated any image or video.

**Describe the level of learning you derived from the project.** A lot, mostly
about building for voice and for MCP clients I do not control:

- MCP in depth: the 2025-11-25 spec over Streamable HTTP, tool schemas generated
  from configuration, and the MCP Apps extension for a card beside the answer.
- OAuth 2.1 from the server's side: PKCE, metadata discovery, dynamic client
  registration, refresh token rotation, and what a real client expects of each.
- Writing for the ear: a correct answer can still be unlistenable, so answers
  needed a word budget, dates said in words and at most three titles.
- Security for a server that fetches what people paste: private networks and
  cloud metadata addresses blocked, through redirects too.
- Testing with a real client: connecting Claude Code found three bugs my own
  simulator never hit.

**Did you gain AI value that you can use in your career?** Yes. MCP is how AI
assistants reach tools and data, and I can now build, secure and test an MCP
server end to end: OAuth for remote clients, tool results shaped for an
assistant, and checks against real clients. I also learned to work with an AI
coding assistant on a whole project, from reading the rules to the tests and the
demo video, and where my own judgement still has to come in: deciding the
scope, checking claims, and reviewing what it wrote.

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

Eight 2400x1600 PNGs (3:2, as Devpost suggests) in `../StackVoice-video/gallery`:
the landing page, the simulator with three answers and their tool calls, the
apps page, the add dialog with its guesses, the shortcut builder's blocks and
Try it, "what's new" before and after a new idea arrives, and Claude Code
running the "ideas about" shortcut and answering from it. The last is Claude
Code's own terminal output, recorded and drawn as it stood.
