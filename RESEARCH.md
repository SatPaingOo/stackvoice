# Landscape Research — "What others are building" (private/personal data + AI + MCP)

Researched 2026-09-05 via GitHub API, MCP directories (Glama), official MCP docs,
and product READMEs. Search engines (Bing HTML, DuckDuckGo) blocked bot access, so
findings below are primary-source (repos + official docs), not SERP summaries.

## 0. The ecosystem at a glance

- MCP servers listed on Glama (largest registry): **~81,800** (Python ~34k, TS ~29k).
- MCP is supported by Claude, ChatGPT, VS Code, Cursor, and now **Alexa+** is the
  first mass-market *voice* agent pushing MCP as a skill surface (per this
  hackathon's Alexa+ track + Amazon's agentic pushes: free on Fire TV, Priceline
  agentic commerce, smart-home features).
- Official MCP reference servers that touch personal data: **Filesystem**, **Memory**
  (knowledge-graph memory, TS), **Git**.

## 1. Who is building what (named projects, verified)

### a) Personal memory layer for AI *agents* (dev-facing)
| Project | What | Notes |
|---|---|---|
| **mem0** | "The memory layer for AI agents" — persistent context across sessions | Library/server/cloud; integrations for Claude Code, Codex, Cursor; NOT end-user facing, NOT voice |
| **codebase-memory-mcp** (DeusData, ★42k) | Codebase → knowledge graph MCP | Dev-tool niche |

### b) Self-hosted "second brain" apps (replace-the-assistant pattern)
| Project | What | Notes |
|---|---|---|
| **Khoj** (★37k) | Open-source personal AI — chat with your notes/docs (md, pdf, notion…), self-hostable or cloud, semantic search + RAG over personal knowledge | Chat-first; accessible from Obsidian/Emacs/WhatsApp/phone. **No MCP, no Alexa/voice-assistant integration** — it replaces the assistant rather than plugging into one you already own |

### c) Personal-knowledge via MCP (popular, but laptop/coding-agent clients only)
| Project | What | Notes |
|---|---|---|
| **mcp-obsidian** (★4.4k) | Claude/coding agents read/write your Obsidian vault via REST API | Proves "personal knowledge over MCP" is wanted — client is a coding agent on your machine |
| **obsidian-local-rest-api** (★2.9k) | REST API + MCP server for a vault | Same pattern |
| **mcpvault** (★1.6k) | Lightweight safe vault access MCP | Same pattern |

### d) Personal finance via MCP — the *crowded* vertical
copilot-money-mcp (★78), moneywiz-mcp-server, banktivity-swift-mcp, asher-mcp
(Israeli banks), screener-mcp (Indian equities)… Many people are rushing to expose
*their* personal financial data to AI via MCP. Evidence the "give AI my private
data through MCP" pull is real — and vertical-specific.

### e) Voice agents + MCP — basically **empty**
| Project | What | Notes |
|---|---|---|
| **Roomey AI Voice Agent** (★67) | Open-source voice agent for "personal & business life", memory, smart home, calendar, Gemini-powered | **MCP integration is "coming soon"** — not shipped. Standalone voice app, not an Alexa skill |
| **alexa-mcp-server**, **m0nkmaster/alexa-mcp** (★2) | Control *Alexa devices* FROM Claude/other MCP clients | **Reverse direction** — Alexa is the peripheral, a chat agent is the brain |
| **Alexa-Shopping-List** (★22) | Claude/Cursor manage your Alexa shopping list via MCP | Also reverse direction (Alexa = data source for laptop agents) |

### f) Workflow/automation platforms
n8n (★203k), activepieces (~400 MCP servers) — visual platforms for wiring MCP
servers into automations. General-purpose, not voice, not personal-knowledge.

## 2. What this means for our project

1. **The gap is real and named:** nobody ships "the assistant you already own
   (Alexa+) as the brain, your self-hosted MCP server as its hands." Existing work
   is either (a) replace the assistant (Khoj, Roomey), (b) extend a laptop coding
   agent (Obsidian MCP, mem0), or (c) the reverse Alexa direction (laptop agent
   drives Alexa devices). The direction this hackathon's Alexa+ track asks for is
   unoccupied.

2. **Validation for the underlying desire:** Khoj (37k★) proves people want to chat
   with their own data; Obsidian-MCP popularity proves MCP is an acceptable
   mechanism; the finance cluster proves people actively build private-data MCP
   bridges. Demand is not the risk — differentiation is.

3. **Our differentiation vs each neighbor:**
   - vs **Khoj**: we don't replace the assistant or require a new app — we make any
     user's existing sources queryable from the assistant they already talk to,
     config-driven, no data leaves their server.
   - vs **Obsidian MCP**: source-agnostic + multi-source + config-driven (not one
     app's vault), and voice-first rather than laptop-agent-first.
   - vs **mem0**: we are not a memory layer for agents — we expose live, user-owned
     data sources as tools.

4. **Risk to carry into the build:** Alexa+ *developer* onboarding for external MCP
   servers is thinly documented right now (developer.amazon.com MCP page 404s,
   rules say only "follow the open-source docs"). Mitigation: build to the open MCP
   spec (2025-11-25, Streamable HTTP) so the server works with **any** MCP client,
   and validate with MCP Inspector + an agentic client early. The demo does not
   depend on Alexa+ specifics; Alexa+ is the story, MCP is the deliverable.

---

# Update — 2026-09-12 (second research pass)

The 2026-09-05 pass searched the *personal-data × voice* axis only. This pass
searched the *config-driven MCP server* axis and re-checked Amazon's docs. Two
findings change the plan.

## 3. Correction: Alexa+ MCP Toolkit docs now exist

The 09-05 note "developer.amazon.com MCP page 404s" is **no longer true**. The
Alexa+ MCP Toolkit is documented (overview + quickstart, last updated
2026-08-03) and adds hard requirements the first pass could not see:

| Requirement | Source |
|---|---|
| Streamable HTTP, MCP spec 2025-11-25 | MCP Toolkit overview |
| **OAuth 2.1 + PKCE (S256)** with `resource` parameter | MCP Toolkit quickstart |
| `/.well-known/oauth-authorization-server` metadata endpoint | quickstart |
| `401 Unauthorized` for unauthenticated requests | quickstart |
| **< 500 ms round-trip latency** | quickstart |
| `addon.json` (6 icon sizes, 600x900 carousel, privacy + terms URLs, 3–4 example phrases) | quickstart |
| Onboarding via `alexa-ai` CLI; **US availability only** | overview |

Consequences: the "no auth beyond a shared token" non-goal in ARCHITECTURE.md is
**withdrawn** (OAuth moves into Stage 2), and the 500 ms budget makes a
cold-fetch-per-call design unacceptable (see FRAMEWORK.md §8).

**Offsetting good news:** the hackathon rules accept a *simulated Alexa+
experience* built with any tool, with no MCP-shaped surface required. Real
Alexa+ access — US-only, device-gated — is therefore **not** on the critical
path. Judges evaluate via the public repo and a demo video under 3 minutes.

## 4. Prior art on the config-driven axis (missed in pass 1)

| Project | What it does | Overlap with StackVoice |
|---|---|---|
| **gen-mcp** (`genmcp/gen-mcp`, Go, "early preview") | "Create MCP servers from simple YAML configs — no programming required"; OpenAPI auto-conversion; TLS + OAuth/OIDC built in | **P1 almost exactly** |
| **mcpany/core** (Go, ★22) | "Configuration over Code": one binary reads YAML/JSON capability definitions; REST/gRPC/GraphQL/CLI backends; dynamic tool registration; dashboard UI; multi-tenant isolation | **P1 + P2 + P3** |

**Therefore: "config-driven MCP server" is not a novelty claim and must not be
pitched as one.** A judge who searches will find both projects.

## 5. Revised differentiation (what actually holds)

1. **Persona, not plumbing.** gen-mcp and mcpany serve people who already have an
   API or an OpenAPI spec. StackVoice serves the self-hoster whose data is the
   *output of their own nightly pipelines* — GitHub Actions writing JSON read
   models. The source type, not the config mechanism, is the product.
2. **A real, live demo nobody else can copy.** Two running pipelines
   ([information-hub](https://github.com/SatPaingOo/information-hub), 125+
   verified items, and [eventpulse](https://github.com/SatPaingOo/eventpulse))
   with public JSON updated daily. Not a mock, not a sample API.
3. **Voice-shaped responses — the real technical differentiator.** gen-mcp and
   mcpany return API payloads. A voice assistant cannot speak a JSON array. A
   response-shaping layer that turns a read model into two sentences a person can
   listen to is genuine engineering, is what the Alexa+ track is actually about,
   and maps directly onto the Design judging criterion. **This becomes a first-class
   pillar, not an afterthought inside the search service.**

## 6. Field size

Devpost reports **4,539 participants** across the four tracks (Fire TV, Alexa+,
Ring, Bee) as of 2026-09-12. The project gallery stays unpublished until judging,
so competing submissions cannot be inspected. Assume the Alexa+ track is crowded
with generic "expose my API over MCP" entries — the persona and the voice
shaping are what separate this from them.
