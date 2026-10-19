# Friction Log — StackVoice

Friction met while building StackVoice, a self-hosted MCP server entered in the
Alexa+ track of the Build, Ship, Shape: Amazon Developer Hackathon. Each entry
records the task attempted, the steps taken, what was expected and what
happened, a severity, the workaround used, and one suggestion for Amazon.

**Severity:** `blocker` could not proceed · `major` cost more than an hour or
forced a design change · `minor` worked around quickly.

| Date | Friction | Severity |
|---|---|---|
| 2026-09-05 | Alexa+ MCP onboarding docs were not discoverable | major |
| 2026-09-12 | Auth requirement is only stated in the quickstart, not the overview | major |
| 2026-09-13 | No guidance on what a "self-hosted MCP server" should expose | minor |
| 2026-10-04 | Alexa+ client registration is stated only on the account linking page | major |
| 2026-10-18 | The Alexa+ add-on tools are a partner-only preview, and the setup pages did not say so | major |

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

### 2026-10-04 — Alexa+ client registration is stated only on the account linking page

- **Task:** Check that StackVoice's OAuth 2.1 server is ready for Alexa+ account
  linking.
- **Steps taken:** Built the authorization server with the MCP TypeScript SDK's
  authorization router, which registers clients through Dynamic Client
  Registration at `/register`. Then read the Alexa+ MCP Toolkit quickstart and
  the "Account Linking for MCP Add-ons" page.
- **Expected:** The Toolkit overview or quickstart, which already state the
  transport, PKCE and latency requirements, would also say which client
  registration mechanism Alexa+ uses. MCP spec 2025-11-25 allows three:
  pre-registration, Client ID Metadata Documents, and Dynamic Client
  Registration.
- **Actual:** Only the account linking page says "Static client registration —
  Dynamic Client Registration (DCR) isn't supported." Alexa+ needs a client ID
  and secret created by hand on the authorization server, every Alexa redirect
  URI registered, and refresh tokens. Pre-registration is allowed by the spec,
  so the requirement is reasonable, but it was found after the server was built
  around the SDK's dynamic registration.
- **Severity:** major
- **Workaround:** None yet. StackVoice's authorization server supports only
  dynamic registration (since 2026-10-19 its clients outlive a restart), so
  pre-registered clients are recorded as a known gap, and the submission uses
  the simulated Alexa+ path the rules allow.
- **Suggestion for Amazon:** State the registration mechanism in the Toolkit
  overview and quickstart, beside the transport and PKCE requirements, and
  publish the full list of Alexa redirect URIs there, so a developer can set up
  the client before the first linking attempt.

### 2026-10-18 — The Alexa+ add-on tools are a partner-only preview, and the setup pages did not say so

- **Task:** Test StackVoice end to end against Alexa+, including the 500 ms
  latency budget the quickstart sets.
- **Steps taken:** On 2026-09-12 read the MCP Toolkit overview and quickstart,
  which gave onboarding through the `alexa-ai` CLI and US availability. Looked
  for a developer sandbox, test console or simulator that an entrant could use.
  On 2026-10-18 read the hackathon FAQ.
- **Expected:** The setup pages would say who can use the tools, so an entrant
  could plan around it from the start.
- **Actual:** The FAQ says the Category SDK, MCP Toolkit, CLI and Web Simulator
  are a preview for select partners only, with no way for hackathon participants
  to get access, and that individual setup pages often leave this out. The pages
  read in September gave US availability as the limit, not the partner gate.
  Routing, spoken answers and the 500 ms budget as Alexa+ measures it could not
  be checked.
- **Severity:** major
- **Workaround:** Built a simulated Alexa+ client that calls the server over the
  same Streamable HTTP transport, as the rules and the FAQ allow, and measured
  latency there: 40 to 180 ms per tool with a warm cache on 2026-09-12.
- **Suggestion for Amazon:** Put the partner-only status at the top of every
  Toolkit setup page, and offer hackathon entrants a test console for MCP
  add-ons, even text-only, so they can see how Alexa+ routes to their tools and
  how long each call takes.

---

## Adding an entry

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
