# StackVoice — Framework (product + plan)

**Ask your own stuff, not the internet.**

Status: **built, preparing submission** (2026-09-13). The MCP server, OAuth,
simulator, console, CLI, universal sources and shortcut flows are done. Hosting,
the demo video and the Devpost submission remain.

---

## 1. Verified constraints (official rules, re-checked 2026-09-13)

Source: the hackathon's official rules, overview and dates pages on Devpost.

| Requirement | What StackVoice does | State on 2026-09-13 |
|---|---|---|
| A working MCP server, spec 2025-11-25 or later, over Streamable HTTP, **or** a simulated Alexa+ experience | Both: a real server, and a simulator that calls it as an MCP client | done |
| The required technology imported and called at runtime, not only named | `@modelcontextprotocol/sdk` server and client, called in `src/` | done |
| A public GitHub repository with all source, assets and run instructions, and an open-source license visible at the top | MIT, detected by GitHub. The repository is private until submission | **open** |
| A demo video under 3 minutes, public on YouTube or Vimeo, in English, showing the project working, with no third-party trademarks or copyrighted music without permission | Outline in [docs/devpost-submission.md](./docs/devpost-submission.md) | **open** |
| A text description, the primary track and any mini challenge | Draft in docs/devpost-submission.md; Alexa+ track, Open Source mini challenge | drafted |
| Product feedback on every Amazon tool, API or SDK used | Not written; to draw on FRICTION_LOG.md | **open** |
| Free testing access for judges until the judging period ends, with credentials if anything is private | Needs a hosted server (§7 Stage 7) | **open** |
| Disclosure of work that existed before the submission period | information-hub predates it; see docs/devpost-submission.md | drafted |
| All materials in English | Code, docs and pages are English | done |
| Friction log, for up to a 10% bonus in Stage 2 judging | Three entries in FRICTION_LOG.md | in progress |

**Dates.** Submissions 2026-08-31 10:15 PDT to **2026-10-23 12:00 PDT**. Judging
2026-10-26 to 2026-11-20. Winners announced 2026-12-03.

**Judging.** Stage 1 is pass or fail: does the project fit the theme and apply
the required technology. Stage 2 weighs four criteria equally: Tech
Implementation, Design, Potential Impact and Quality of the Idea.

**Prizes, Alexa+ track.** 1st $25,000 + $15,000 AWS credits · 2nd $15,000 +
$5,000 · 3rd $4,000 + $1,000. Open Source and AWS Builder mini challenges each
award $5,000 + $5,000 AWS credits.

**Eligibility.** The rules exclude Brazil, Quebec, Russia, Crimea, Cuba, Iran,
North Korea, and anyone where US or local law prohibits taking part or receiving
a prize. Myanmar is not named. That is not the same as confirmed eligibility;
see risk 1 in §8.

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

## 4. Judging map (revised 2026-09-13)

| Criterion | How StackVoice meets it |
|---|---|
| Tech Implementation | Real MCP server on the official SDK, spec 2025-11-25, Streamable HTTP; OAuth 2.1 authorization server with PKCE (S256); tools and their input schemas generated from config; format detection from content; a network guard against server-side request forgery; a flow interpreter with a trace; clean layers; 605 unit and 38 browser tests on 2026-09-13 |
| Design | One box for any source, with every guess shown on real data; a shortcut builder that works like phone shortcuts; spoken answers; landing page, console and simulator that read as one product from phone to desktop |
| Potential Impact | Anyone with a feed, a sheet or an API can use it, not only developers; self-hosted at $0; keys never leave the server |
| Quality of the Idea | The assistant people already own, given hands on their own data, plus voice shortcuts in their own words; neighbours start from API specs and return raw payloads |

## 5. Cost model

Everything $0: Node.js and the MCP SDK are open source, the demo data is public,
speech uses browser APIs, and the demo video is recorded locally. Hosting must
also be $0 and must stay up until judging ends on 2026-11-20. A Cloudflare Tunnel
from a personal computer would need that computer on for two months, so the plan
is an always-free cloud VM. The hackathon provides no credits.

## 6. Docs map

README.md (entry) · FRAMEWORK.md (this) · RESEARCH.md · ARCHITECTURE.md ·
CONFIGURATION.md · MANAGEMENT.md · CODING_STANDARDS.md · FRICTION_LOG.md ·
docs/devpost-submission.md

## 7. Roadmap (revised 2026-09-13; submit target 2026-10-20, deadline 2026-10-23 12:00 PDT)

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

### Remaining

| Stage | Window | Milestone | Done when |
|---|---|---|---|
| **7 — Host** | 2026-09-21 to 10-04 | Always-free VM, HTTPS, `token` mode, demo apps loaded | A judge can open `/simulator` from a link, and `/console` with the token from the testing instructions |
| **8 — Friction log + product feedback** | to 2026-10-15 | Friction entries for every Amazon tool actually used; the required product feedback text | Both sections ready to paste into the form |
| **9 — Demo video** | 2026-10-05 to 10-15 | Under 3 minutes, English, public, following docs/devpost-submission.md | Uploaded and linked |
| **10 — Submit** | 2026-10-19 to 10-20 | Repository made public; Devpost form complete | Submitted, with 10-21 to 10-23 as buffer |

**History of scope changes.**

- **2026-09-12:** the simulator was pulled ahead of the CLI, because it is the
  surface a judge sees. The web console and admin MCP tools were cut.
- **2026-09-13:** the web console came back. The product claims anyone can add
  their own apps, and a terminal-only path makes that true for developers only.
  With `ManagementService` already built, the console was a thin adapter.
- **2026-09-13:** sources went beyond GitHub, and shortcuts became flows. Both
  follow from the same claim: anyone, with whatever data they have, in their own
  words.

## 8. Open risks (revised 2026-09-13)

1. **Eligibility (high).** Myanmar is not named among excluded places, but the
   rules also exclude anyone US law bars from receiving a prize. US sanctions on
   Myanmar target listed people and entities rather than the whole country, which
   suggests participation is allowed, but only Devpost can confirm it and say how
   a prize would be paid. Ask Devpost support before Stage 9.
2. **Hosting must last until 2026-11-20 (high).** A tunnel from a personal
   computer will not. The simulator stands down in `oauth` mode, so the hosted
   demo runs in `token` mode, and the console's token goes in the testing
   instructions.
3. **Real Alexa+ untested (medium).** The Toolkit is US-only. The rules accept a
   simulated experience; the README and the video say plainly that it is one.
4. **Latency (medium).** Warm calls were 40–180 ms on 2026-09-12 and the cache is
   warmed at startup, but a cold GitHub fetch exceeds the Alexa+ budget of 500 ms.
   Not verifiable without a device.
5. **Differentiation (medium).** Config-driven MCP servers exist. Pitch the three
   separators in §2, never config-driven alone.
6. **A public simulator on the hosted server (low).** Anyone with the link can
   ask about the demo data. The data is already public and every tool is
   read-only, but the hosted settings must keep private network access off.

Resolved: Alexa+ docs found and the simulated path confirmed (2026-09-12); remote
auth built as OAuth 2.1 (2026-09-12); SDK Streamable HTTP server support confirmed
(2026-09-12).

---

Last reviewed: 2026-09-13
