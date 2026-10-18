# StackVoice — Framework (product + plan)

**Ask your own stuff, not the internet.**

Status: **built, preparing submission** (2026-10-18). The MCP server, OAuth,
simulator, console, CLI, universal sources and shortcut flows are done, and the
server is hardened. The demo video and the Devpost submission remain. Hosting
was dropped on 2026-10-18, when the hackathon FAQ said it is not required.

---

## 1. Verified constraints (official rules re-checked 2026-10-04, FAQ read 2026-10-18)

Source: the hackathon's official rules, updates, dates and FAQ pages on Devpost.
The rules carry an update dated 2026-09-16 to the code repository requirement.

| Requirement | What StackVoice does | State on 2026-10-18 |
|---|---|---|
| A working MCP server, spec 2025-11-25 or later, over Streamable HTTP, **or** a simulated Alexa+ experience. The FAQ confirms that a web page acting as a real MCP client (initialize, tools/list and tools/call over Streamable HTTP) satisfies it, and calls an existing AI assistant app calling the same server a bonus | Both: a real server, and a simulator that calls it as an MCP client. The bonus too: on 2026-10-19 Claude Code signed in through the server's OAuth and ran a shortcut, and the video shows it | done |
| The required technology imported and called at runtime, not only named | `@modelcontextprotocol/sdk` server and client, called in `src/` | done |
| A GitHub repository with all source, assets and run instructions. Since 2026-09-16 it may be public with an open-source license visible at the top, **or** private and shared with testing@devpost.com and six Amazon GitHub accounts named in the rules | MIT, detected by GitHub. The Open Source mini challenge needs a public repository, so it goes public at submission. Its whole history was checked for secrets on 2026-10-04 and none were found | **open** |
| A demo video under 3 minutes, public on YouTube or Vimeo, in English, showing the project working, with no third-party trademarks or copyrighted music without permission. On the simulated path it must clearly show the simulated experience | Recorded 2026-10-19: 2:58, narrated in English with subtitles, the simulator scenes labelled as simulated, Claude Code shown calling the same server, music written for it (not a third-party track); see [docs/devpost-submission.md](./docs/devpost-submission.md). Not uploaded yet | **open** |
| A text description, the primary track and any mini challenge | Draft in docs/devpost-submission.md; Alexa+ track, Open Source mini challenge | drafted |
| Open Source mini challenge: contribution URL, project repository URL, GitHub username, and what was done, how it works and why it matters | Drafted in docs/devpost-submission.md. The rules call it "a new, additional open-source project"; whether the entry's own repository counts is to be asked (risk 7 in §8) | drafted |
| Product feedback on every Amazon tool, API or SDK used, answering five set questions | Written in docs/devpost-submission.md: no Amazon tool could be used, because the Alexa+ tools are partner-only, and the answers say so | done |
| Optional: feature requests, each with why it matters and a priority (Critical, Important or Nice-to-have) | Draft in docs/devpost-submission.md | drafted |
| The project available to judges free of charge until the judging period ends, "via code repository and demo video", with credentials if anything is private. Judges need not test it, and may judge on the description, images and video alone. The FAQ: "a locally runnable public repo plus your demo video is enough", hosting is not required, and a server need not stay running after submission | Run instructions in the repository, checked from a fresh clone. Not hosted; [DEPLOY_PLAN.md](./DEPLOY_PLAN.md) stays as a ready plan | done |
| Disclosure of work that existed before the submission period | information-hub predates it; see docs/devpost-submission.md | drafted |
| All materials in English | Code, docs and pages are English | done |
| Friction log, for up to a 10% bonus, recommended by Amazon's team in Stage 1 and applied in Stage 2 | Five entries in FRICTION_LOG.md, to paste into the form's optional friction log field | done |

**Dates.** Submissions 2026-08-31 10:15 PDT to **2026-10-23 12:00 PDT**, which
is 2026-10-24 01:30 in Myanmar. The rules and the FAQ give the judging period
as 2026-11-09 to 2026-11-20; the dates page still shows it starting
2026-10-26, and the rules prevail where they differ. Winners announced on or
around 2026-12-03. Amazon holds office hours on 2026-10-06 at 10:30 PDT and
2026-10-19 at 09:00 PDT.

**Judging.** Stage 1 is pass or fail: does the project fit the theme and apply
the required technology. Stage 2 weighs four criteria equally: Tech
Implementation, Design, Potential Impact and Quality of the Idea. Judging may
use expert panels, peer review or automated AI-driven analysis. For Alexa+, the
rules call a single-turn Q&A bot or a basic MCP wrapper around an existing API
obvious, and name as creative: agentic workflows across services, add-ons that
keep state across sessions, purchasing, media support such as cards, MCP Apps
and Agent Skills.

**Prizes, Alexa+ track.** 1st $25,000 + $15,000 AWS credits · 2nd $15,000 +
$5,000 · 3rd $4,000 + $1,000. Open Source and AWS Builder mini challenges each
award $5,000 + $5,000 AWS credits.

**AWS credits.** Entrants may request $150 in AWS Promotional Credits through a
form by 2026-10-21 12:00 PT, while supplies last. StackVoice does not need them
unless it is hosted on AWS.

**Eligibility.** The rules exclude Brazil, Quebec, Russia, Crimea, Cuba, Iran,
North Korea, any other country comprehensively sanctioned by the US Treasury's
Office of Foreign Assets Control, and anyone where US or local law prohibits
taking part or receiving a prize. Myanmar is not named, and US sanctions on it
target listed people and entities rather than the whole country. The FAQ
repeats the same rule. That is not the same as confirmed eligibility; see
risk 1 in §8.

## 2. Concept & pitch (revised 2026-09-13)

**One sentence.** StackVoice turns your own feeds, APIs, spreadsheets,
repositories and files into tools a voice assistant can call, and answers in
sentences you can listen to.

**Pitch, spoken in fifteen seconds.** *"My assistant can search the whole
internet, but it can't tell me what my own pipeline found last night. So I built
StackVoice. Paste any feed, API or spreadsheet, and your assistant can answer
from it out loud. You can even build your own voice shortcuts, like on your
phone, without writing code."*

**What separates it** (evidence in RESEARCH.md §8):

1. **No API spec needed.** A person pastes whatever they have. StackVoice reads
   the content to decide the format and the fields, and shows its guesses with
   real samples. Config-driven neighbours start from an API definition.
2. **Answers made for listening.** A shaping layer turns records into a sentence
   or two. Neighbours return API payloads a speaker cannot read aloud.
3. **Flows a person builds and says in their own words.** A phrase such as
   "news about {topic}" becomes a tool with a `topic` input, and blocks decide
   what gets said. No neighbour describes multi-step or conditional flows.

**What the pitch must not claim.**

- That config-driven MCP is new. It is not (RESEARCH.md §4).
- That data never leaves the server. The assistant hears the answers.
- That it runs on Alexa+ devices. It has not been tried on one; the simulator is
  the demonstration.

## 3. Scope — six pillars (revised 2026-09-13)

| Pillar | What it means | Doc |
|---|---|---|
| **P1 Any source becomes tools** | Feeds, JSON APIs, CSV and published sheets, GitHub repositories and local files, inspected into a field map a person corrects by clicking | CONFIGURATION.md §5 |
| **P2 Multi-app registry** | Any number of apps, each with its own tool namespace (`{app}_search`, `{app}_read`, `{app}_status`), reloaded when a file changes | CONFIGURATION.md §3 |
| **P3 Management** | One service, two faces: a web console for everyone and a CLI for developers. Admin MCP tools stay cut | MANAGEMENT.md |
| **P4 Standards-compliant engineering** | Clean architecture, SOLID, strict TypeScript, zod at boundaries, tests per layer and in a real browser | ARCHITECTURE.md |
| **P5 Voice-shaped responses** | Records become speakable sentences, with dates said as "yesterday" rather than timestamps | ARCHITECTURE.md §3 |
| **P6 Shortcut flows** | Blocks with slots, conditions and a trace, built in the console and exposed as tools | CONFIGURATION.md §7.5 |

The assistant does the understanding and chooses the tool. The server's job is
well-described, focused tools that return speakable answers. Shortcuts are for
the questions a person asks the same way every day.

## 4. Judging map (revised 2026-10-04)

| Criterion | How StackVoice meets it |
|---|---|
| Tech Implementation | Real MCP server on the official SDK, spec 2025-11-25, Streamable HTTP; OAuth 2.1 authorization server with PKCE (S256); tools and their input schemas generated from config; format detection from content; a network guard against server-side request forgery; a lockout on repeated wrong tokens; a flow interpreter with a trace; state that survives conversations and restarts; an MCP Apps view for screens; clean layers; 681 unit and 39 browser tests on 2026-10-19; a third-party client, Claude Code, through the whole OAuth flow (dynamic registration, consent, PKCE) to a shortcut call |
| Design | One box for any source, an answer card a screen can show beside the spoken answer, with every guess shown on real data; a shortcut builder that works like phone shortcuts; spoken answers; landing page, console and simulator that read as one product from phone to desktop |
| Potential Impact | Anyone with a feed, a sheet or an API can use it, not only developers; self-hosted at $0; keys never leave the server |
| Quality of the Idea | The assistant people already own, given hands on their own data, plus voice shortcuts in their own words; neighbours start from API specs and return raw payloads. Against the rules' Alexa+ examples: shortcuts are workflows across apps with conditions, a conversation keeps context ("tell me more"), `whats_new` keeps state across sessions, and results come with an MCP Apps card for a screen. Purchasing is not built, and Agent Skills are the track's other path rather than a feature; the pitch leads with why it is not a basic wrapper |

## 5. Cost model

Everything $0: Node.js and the MCP SDK are open source, the demo data is public,
speech uses browser APIs, and the demo video is recorded locally. Judges run it
from the repository, so there is no hosting cost. If a hosted copy is wanted
later, DEPLOY_PLAN.md describes a free Render web service. The hackathon offers
$150 in AWS credits on request (§1), which only matter if it is hosted on AWS.

## 6. Docs map

README.md (entry) · FRAMEWORK.md (this) · RESEARCH.md · ARCHITECTURE.md ·
CONFIGURATION.md · MANAGEMENT.md · CODING_STANDARDS.md · FRICTION_LOG.md ·
DEPLOY_PLAN.md · docs/devpost-submission.md

## 7. Roadmap (revised 2026-10-04; submit target 2026-10-20, deadline 2026-10-23 12:00 PDT)

### Done

| Stage | Done | Milestone |
|---|---|---|
| 0 — Verify + research | 2026-09-05 | Rules confirmed; landscape mapped (RESEARCH.md §1–2) |
| 0.5 — Docs & architecture | 2026-09-06 | Full doc set |
| 0.6 — Research pass 2 + repo hygiene | 2026-09-12 | Alexa+ Toolkit requirements found; git, MIT, config fix (RESEARCH.md §3–6) |
| 1 — Scaffold + MCP boot | 2026-09-12 | Streamable HTTP transport, spec 2025-11-25 negotiated, `stack_status` |
| 2 — Auth + registry + first adapter | 2026-09-12 | OAuth 2.1 with PKCE S256, metadata and 401 challenge; app registry; GitHub adapter |
| 3 — Voice shaping + second app | 2026-09-12 | Response shaper, `markets` app, cache prewarm; tools answered in 40–180 ms warm |
| 4 — Management CLI | 2026-09-13 | List, status, show, validate, add, enable, disable, remove; repo inspection; hot reload |
| 5 — Alexa+ simulator | 2026-09-12 | Intent planner, loopback MCP client, speech in and out, tool traces, conversation mode |
| 5.1 — Web console and redesign | 2026-09-13 | Landing page, console routes, settings, sign-in, one design system |
| 5.2 — Universal sources | 2026-09-13 | RSS, Atom, JSON, CSV and files; API keys as secret references; network guard |
| 5.3 — Dialog components | 2026-09-13 | Add and edit in dialogs built from typed client classes |
| 5.4 — Shortcut flows | 2026-09-13 | Blocks, slots as tool inputs, simulator routing, block builder with Try it |
| 6 — Docs and pitch | 2026-09-13 | Docs match the product; pitch and submission draft written |
| 6.1 — Tooling | 2026-09-13 | ESLint with the layer rule, Prettier, Vitest 5; testing instructions checked from a fresh clone |
| 6.2 — Hardening for hosting | 2026-10-04 | Simulator sessions closed after each call; a port that cannot be bound fails the start; wrong-token lockout and a Secure session cookie; history checked for secrets; dependency advisories cleared; deploy plan written |
| 6.3 — What's new | 2026-10-18 | `whats_new`: what arrived since the owner last asked, remembered across conversations and restarts; demo video and gallery |
| 6.4 — Answer card | 2026-10-19 | An MCP Apps view (spec 2026-01-26) linked from search, read and `whats_new`, shown by the simulator as an MCP Apps host; written without the SDK |

### Remaining

| Stage | Window | Milestone | Done when |
|---|---|---|---|
| ~~7 — Host~~ | Dropped 2026-10-18 | Not required, per the FAQ | — |
| **8 — Friction log + product feedback** | to 2026-10-20 | Friction entries for every Amazon tool actually used; the required product feedback text | Both sections ready to paste into the form |
| **9 — Demo video** | 2026-10-18 to 10-20 | Under 3 minutes, English, public, following docs/devpost-submission.md | Uploaded and linked |
| **10 — Submit** | 2026-10-21 | Repository made public; Devpost form complete | Submitted, with 10-22 and 10-23 as buffer |

**History of scope changes.**

- **2026-09-12:** the simulator was pulled ahead of the CLI, because it is the
  surface a judge sees. The web console and admin MCP tools were cut.
- **2026-09-13:** the web console came back. The product claims anyone can add
  their own apps, and a terminal-only path makes that true for developers only.
  With `ManagementService` already built, the console was a thin adapter.
- **2026-09-13:** sources went beyond GitHub, and shortcuts became flows. Both
  follow from the same claim: anyone, with whatever data they have, in their own
  words.
- **2026-10-18:** hosting was dropped. The FAQ says a locally runnable public
  repository plus the demo video is enough, and the days left went to the video.

## 8. Open risks (revised 2026-10-18)

1. **Eligibility (high).** Myanmar is not named among excluded places, but the
   rules also exclude anyone US law bars from receiving a prize. US sanctions on
   Myanmar target listed people and entities rather than the whole country, which
   suggests participation is allowed, but only Devpost can confirm it and say how
   a prize would be paid. The FAQ repeats the rule without naming Myanmar. Ask
   at the office hours on 2026-10-19 (22:30 in Myanmar), the last before the
   deadline.
2. **Judges must run it themselves (medium).** With no hosted copy, a judge who
   tests it clones the repository and runs `npm ci` and `npm run dev`. The
   testing instructions were checked from a fresh clone on 2026-09-13, and the
   video has to carry the demonstration for judges who do not run it.
3. **Real Alexa+ untested (medium).** The Toolkit is a preview for select
   partners only, and the FAQ says no participant can connect a server to
   Alexa+. The rules accept a simulated experience; the README and the video
   say plainly that it is one.
   Found on 2026-10-04: Alexa+ account linking needs a statically registered
   OAuth client, which StackVoice does not support, so a real device could not
   link to it yet.
4. **Latency (medium).** Warm calls were 40–180 ms on 2026-09-12 and the cache is
   warmed at startup, but a cold GitHub fetch exceeds the Alexa+ budget of 500 ms.
   Not verifiable without a device.
5. **Differentiation (medium).** Config-driven MCP servers exist, and the rules
   call a basic MCP wrapper around an existing API obvious. Pitch the three
   separators in §2, never config-driven alone.
6. **A public simulator, if it is ever hosted (low).** Anyone with the link
   could ask about the demo data. The data is already public and every tool is
   read-only, but hosted settings must keep private network access off.
7. **Open Source mini challenge (medium).** The rules ask for "a new,
   additional open-source project" or a contribution to a public repository,
   alongside the primary track entry, with a contribution URL and a project
   repository URL. Whether the entry's own new repository counts is unclear.
   The FAQ does not answer it. The rules ask for ambiguity to be raised in
   writing; ask Devpost with the eligibility question. If it does not count,
   the fallback is a real contribution to a public repository that the build
   depended on.

Resolved: Alexa+ docs found and the simulated path confirmed (2026-09-12); remote
auth built as OAuth 2.1 (2026-09-12); SDK Streamable HTTP server support confirmed
(2026-09-12); hosting found not to be required (FAQ, 2026-10-18).

---

Last reviewed: 2026-10-19
