# Friction Log — StackVoice

Amazon grants up to a **10% judging bonus** for a genuine friction log kept
during development. Per the official rules, each entry should record: the
specific task, the steps taken, expected vs. actual result, a severity rating,
the workaround used, and one actionable suggestion.

**Severity scale:** `blocker` (could not proceed) · `major` (cost > 1 h or forced
a design change) · `minor` (annoying, worked around quickly).

---

## Entry template

```
### YYYY-MM-DD — <short title>
- **Task:**
- **Steps taken:**
- **Expected:**
- **Actual:**
- **Severity:**
- **Workaround:**
- **Suggestion for Amazon:**
```

---

### 2026-09-05 — Alexa+ MCP onboarding docs were not discoverable

- **Task:** Find the official requirements for connecting a self-hosted MCP
  server to Alexa+ before committing to an architecture.
- **Steps taken:** Followed the hackathon rules' pointer to "the open-source
  docs"; searched developer.amazon.com for an Alexa+ MCP page; tried the MCP
  Toolkit URL patterns directly.
- **Expected:** The hackathon rules page links to the Alexa+ MCP Toolkit docs,
  since the Alexa+ track requires exactly that deliverable.
- **Actual:** The rules only said "follow the open-source docs". The MCP Toolkit
  pages exist at `developer.amazon.com/docs/alexaplus/add-ons/` but are not
  linked from the track description, so a full week of architecture work was
  done against the open MCP spec alone.
- **Severity:** major
- **Workaround:** Designed to the open MCP spec (2025-11-25, Streamable HTTP) so
  the server works with any MCP client, then re-derived the Alexa+ specifics
  after finding the Toolkit docs by direct search.
- **Suggestion for Amazon:** Link the Alexa+ MCP Toolkit overview and quickstart
  directly from the Alexa+ track description on the hackathon page. One hyperlink
  removes a week of guesswork for every entrant in the track.

### 2026-09-12 — Auth requirement is only stated in the quickstart, not the overview

- **Task:** Decide whether the server needs OAuth for the hackathon deliverable.
- **Steps taken:** Read the MCP Toolkit *overview* page end to end, then the
  *quickstart* page.
- **Expected:** A hard requirement like "OAuth 2.1 with PKCE, plus
  `/.well-known/oauth-authorization-server`, plus 401 on unauthenticated
  requests" appears in the overview, where architecture decisions get made.
- **Actual:** The overview covers transport and deployment but never mentions
  authentication. The mandatory OAuth 2.1 + PKCE (S256) requirement, the
  metadata endpoint, and the < 500 ms latency budget appear only in the
  quickstart, which reads as an optional "try it" page.
- **Severity:** major
- **Workaround:** Read every page under `add-ons/` before finalising the
  architecture; moved OAuth from "later" to Stage 2 of the build plan.
- **Suggestion for Amazon:** Put a short "Requirements at a glance" box on the
  MCP Toolkit overview page listing transport, spec version, auth, and latency.
  Developers read the overview to decide *whether* to build; the constraints
  that decide that belong there.

### 2026-09-13 — No guidance on what a "self-hosted MCP server" should expose

- **Task:** Decide what tools to generate for a user's own data project, so an
  Alexa+ customer can ask about it in their own words.
- **Steps taken:** Read the Alexa+ MCP Toolkit overview, quickstart and the
  certification page; looked for a reference add-on or a worked example of tool
  naming, description style, or result length.
- **Expected:** Guidance on what Alexa+ does well with — how long a tool result
  should be before it stops being speakable, whether tool descriptions are used
  for routing, how many tools an add-on can sensibly expose.
- **Actual:** The docs cover transport, auth and packaging thoroughly, and say
  nothing about the shape of a good tool for a *voice* surface. The constraint
  that mattered most in practice, that a spoken answer is two sentences and not
  a JSON array, had to be discovered by building a client and listening to it.
- **Severity:** minor
- **Workaround:** Built a response-shaping layer and a simulator, then tuned the
  spoken output by ear.
- **Suggestion for Amazon:** Publish one reference MCP add-on with its tool
  definitions and sample results, and a short "writing tools for voice" page.
  The transport is the easy half; nobody's first MCP server returns speakable
  results, and every entrant in this track is solving that alone.
