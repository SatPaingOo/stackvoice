# StackVoice — Framework (product + plan)

**Ask your own stuff — not the internet.**

Self-hosted MCP server that turns a user's data projects (apps) into tools an AI
assistant can call. Tools are generated from config; the user manages their apps
through a management system; the codebase follows OOP/SOLID/Clean architecture.

Status: **docs phase (2026-09-05)** — scope, architecture, and standards are
locked in docs; no implementation code yet.

---

## 1. Verified constraints (official rules, checked 2026-09-05)

- **Eligibility:** excluded = Brazil, Quebec, Russia, Crimea, Cuba, Iran, North
  Korea + other OFAC-sanctioned countries. **Myanmar is eligible.** No team cap.
- **Build:** a working Agent Skill **or** a self-hosted MCP server implementing
  **MCP spec 2025-11-25 (or later) over Streamable HTTP**. Public repo +
  open-source license; repo must show the tech actually imported/called.
- **Prizes (Alexa+ track):** 1st $25,000 + $15,000 AWS credits · 2nd $15,000 +
  $5,000 · 3rd $4,000 + $1,000. May stack **one mini challenge** (AWS Builder or
  **Open Source** — we qualify via public MIT repo).
- **Friction log** during development → up to **+10% judging bonus**.
- Judging: Technological Implementation · Design · Potential Impact · Quality of
  the Idea (equal weight).

## 2. Concept & pitch

Cloud assistants can search the internet — they can't see your private data.
StackVoice is a self-hosted MCP server that turns your data stack into tools.
Because everything is config-driven, anyone can point it at their own apps and
start asking in their own words. Your data never leaves your server.

**Pitch line:** *"I built this to query my own nightly intelligence stack by
voice — and because it's config-driven with a management system, anyone can add
their own apps and define their own commands. No code changes."*

Landscape research (RESEARCH.md) confirms the gap: nobody occupies "assistant you
already own + your self-hosted MCP server as its hands." Neighbors replace the
assistant (Khoj ★37k, Roomey), extend laptop coding agents (Obsidian MCP), or run
the reverse direction (laptop agent drives Alexa devices).

## 3. Scope — five pillars (revised 2026-09-12)

| Pillar | What it means | Doc |
|---|---|---|
| **P1 Config-driven MCP core** | Tools auto-generated from config at startup; server is a data adapter (no LLM inside) | ARCHITECTURE.md |
| **P2 Multi-app registry** | Add/remove any number of apps (`config/apps/*.yml`); each app gets its own tool namespace (`{app}_search`, `{app}_read`, `{app}_status`) | CONFIGURATION.md |
| **P3 Management system** | One service, two faces: a web console and a CLI. Both inspect a repo and infer the field map, which is what makes "config-driven" true rather than merely stated. Admin MCP tools stay cut | MANAGEMENT.md |
| **P4 Standards-compliant engineering** | OOP, SOLID, Clean/Hexagonal layers, TypeScript strict, zod at boundaries, tests per layer | CODING_STANDARDS.md |
| **P5 Voice-shaped responses** *(added 09-12)* | A shaping layer turns read models into two spoken sentences. Competing config-driven servers return raw API payloads; a voice assistant cannot speak those. This is the Design differentiator | ARCHITECTURE.md |

Design is **free-form, not fixed commands**: the assistant (e.g. Alexa+) does the
understanding and tool selection; the server's job is well-described, focused
tools. Shortcuts are an optional macro layer, not the interface.

## 4. Judging map

| Criterion | How we hit it |
|---|---|
| Technological Implementation | Real MCP server (spec 2025-11-25, Streamable HTTP); tools generated from config at startup; clean layered architecture (SOLID) |
| Design | One config directory to understand; add-an-app story; management system; tools read naturally |
| Potential Impact | Beyond-me: config-driven → any self-hoster's apps work; real "is my stack healthy / what did it produce" pain; privacy story (data stays on your server) |
| Quality of the Idea | Alexa can't see private pipelines/datasets; nobody occupies this direction; multi-app + management makes it a product, not a one-off |

## 5. Cost model

Everything $0: Node/TS + MCP SDK (open source), GitHub free tier, public JSON APIs
(unauthenticated), Cloudflare Tunnel or free-tier host for the server, OBS for the
demo video. No cloud credits are provided by the hackathon — prizes are the reward.

## 6. Docs map

README.md (entry) · FRAMEWORK.md (this) · RESEARCH.md · ARCHITECTURE.md ·
CONFIGURATION.md · MANAGEMENT.md · CODING_STANDARDS.md · FRICTION_LOG.md

## 7. Roadmap (revised 2026-09-12 — submit target Oct 20; deadline Oct 23 12:00 PDT)

Scope decision (2026-09-12): **Core + Simulator.** Web console and admin MCP
tools are **cut**. OAuth 2.1 moves **forward** into Stage 2 because the Alexa+
MCP Toolkit requires it (RESEARCH.md §3).

| Stage | Window | Milestone | Done when |
|---|---|---|---|
| 0 — Verify + research | done 09-05 | Rules confirmed; landscape mapped | RESEARCH.md |
| 0.5 — Docs & architecture | done 09-06 | Full doc set | 7 docs |
| 0.6 — Research pass 2 + repo hygiene | done 09-12 | Alexa+ Toolkit requirements found; git + MIT + config fix | RESEARCH.md §3–6 |
| ~~1 — Scaffold + MCP boot~~ | **done Sep 12** | Node/TS project, zod config load, Streamable HTTP transport, `stack_status` tool | protocol 2025-11-25 negotiated |
| ~~2 — Auth + registry + first adapter~~ | **done Sep 12** | OAuth 2.1 authorization server (PKCE S256, metadata, 401 challenge); app registry; `github-repo` adapter | every verb returns live data, authenticated |
| ~~3 — Voice shaping + second app~~ | **done Sep 12** | Response shaper, `markets` app, cache prewarm | every tool answers in 40–180 ms |
| ~~4 — Management CLI~~ | **done Sep 13** | `apps`, `status`, `app show/validate/add/enable/disable/remove`, plus repo inspection and config hot reload | a repo nobody configured becomes working tools in one command |
| ~~5 — Alexa+ simulator~~ | **done Sep 12** | Page at `/simulator`: intent planner, loopback MCP client, Web Speech in and out, visible tool traces | full conversation works in a browser |
| **6 — Host + polish** | **Sep 15–Oct 18** | Public HTTPS (Cloudflare Tunnel), README, config docs, friction-log writeup | a judge can clone and run it |
| **7 — Submit** | **Oct 19–20** | Demo video under 3 min (English, public) + Devpost submission | submitted; Oct 21–23 is buffer |

**Order changed 2026-09-12:** the simulator was pulled ahead of the management
CLI. It is the surface a judge actually sees.

**Scope changed 2026-09-13:** the web console is back in, having been cut on
09-12. The cut was wrong. The product claims anyone can point it at their own
apps, and a terminal-only path makes that true for developers only — which is
the Potential Impact criterion, not a nice-to-have. With `ManagementService`
already built, the console was a thin adapter over it, exactly as
ARCHITECTURE.md §5 predicted.

**Shortcut macro layer: done 2026-09-13.** Shortcuts moved out of app files into
`config/shortcuts.yml`, because one spans apps and belongs to none. They are
editable in the console and routable by voice.

**Stretch remaining:** `json-url` and `rss` source types.

## 8. Open risks / next verifications

1. **~~Alexa+ onboarding is thinly documented~~ — RESOLVED 09-12.** The MCP
   Toolkit docs exist and the rules accept a *simulated Alexa+ experience* built
   with any tool. Real Alexa+ access (US-only) is off the critical path. Judges
   evaluate via public repo + demo video.
2. **~~Remote MCP auth is unclear~~ — RESOLVED 09-12.** OAuth 2.1 + PKCE (S256)
   is mandatory for the real platform and is now Stage 2. Carried risk: it is the
   single largest unplanned chunk of work in the revised schedule.
3. **~~TS SDK Streamable HTTP server support~~ — RESOLVED 09-12.**
   `@modelcontextprotocol/sdk` ships `StreamableHTTPServerTransport` plus OAuth
   resource-server helpers. FastMCP is not needed.
4. **Latency budget (NEW, high).** Alexa+ requires < 500 ms round trip. A cold
   `raw.githubusercontent.com` + `api.github.com` fetch will not meet it.
   Mitigation: prewarm the TTL cache at startup and refresh in the background, so
   a tool call never blocks on a network round trip.
5. **Differentiation (NEW, high).** `gen-mcp` and `mcpany/core` already do
   config-driven MCP (RESEARCH.md §4). Do not pitch config-driven as novel. Pitch
   the persona and the voice shaping (RESEARCH.md §5).
6. **Hosting** — keep $0: Cloudflare Tunnel for the demo window; Oracle
   always-free VM as fallback. Not on the critical path since judging is by repo
   and video.
7. **Scope discipline** — the cut list (web console, admin MCP tools) stays cut.
   Anything added back comes out of Stage 5 or 6, never out of Stage 2.
