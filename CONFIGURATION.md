# StackVoice — Configuration

**Config is the product.** A user never edits code. The console and the CLI
write YAML in `config/`, and a person can edit it by hand too; the assistant gets
new tools on the next conversation. This doc is the schema, the validation rules
and worked examples. Companion: ARCHITECTURE.md §4.

---

## 1. Layout

```text
config/
├─ settings.yml        # server behavior (one file)
├─ shortcuts.yml       # flows: one tool that runs blocks
├─ secrets.yml         # API keys; git-ignored, created when a key is saved
├─ seen.json           # what the owner has been told, for whats_new; git-ignored
├─ backups/            # what every write replaced; git-ignored
└─ apps/
   ├─ library.yml      # one app = one file (name must equal app id)
   ├─ markets.yml
   └─ … (user adds more)
data/                  # file sources are read from here only (sources.data_dir)
```

## 2. `config/settings.yml`

```yaml
server:
  host: 127.0.0.1          # default localhost; set 0.0.0.0 behind a tunnel/proxy
  port: 8765
  log_level: info          # debug | info | warn | error
  trusted_proxies: 0       # proxies in front of the server, such as a host's load balancer

auth:
  mode: none               # none | token | oauth
  token: ""                # shared token in "token" mode; consent secret in "oauth" mode
  public_url: ""           # required in "oauth" mode, e.g. https://stackvoice.example.com

console:
  enabled: true            # web console at /console — add and edit apps in a browser

simulator:
  enabled: true            # serves the simulated Alexa+ page at /simulator

sources:
  allow_private_network: false   # let links reach your own network, e.g. a home server
  data_dir: "data"               # file sources are read from here and nowhere else

management:
  cli: true                # CLI face enabled

cache:
  ttl_seconds: 300         # per-URL cache for fetched documents
```

### The console

`console.enabled` serves a page at `/console` for adding and editing apps in a
browser: paste a feed, API, spreadsheet link, repository or file name, review
the inferred mapping, correct it, save. A save takes effect at once.

With `auth.mode: none` the server is on localhost only, so the console is exactly
as reachable as the config file itself and asks for nothing. In `token` or
`oauth` mode it asks for `auth.token` and holds a session cookie for twelve
hours.

### The simulator

`simulator.enabled` serves a page at `/simulator` that acts as a simulated
Alexa+ client: it plans a tool call from what you say, calls this server over
its own MCP endpoint, and reads the answer back. It connects as an ordinary MCP
client rather than calling the services in-process, so what the demo exercises
is the real server.

It stands down in `oauth` mode, because completing an authorization code flow
needs a browser and a human. Run the demo with `auth.mode: none` or `token`, and
switch to `oauth` to show the consent screen and the Alexa+ requirements.

### Data sources

`sources.allow_private_network` is off by default. With it off, a url source
cannot reach loopback, private or cloud metadata addresses, and neither can a
redirect from a public address. Turn it on only for a server that the internet
cannot reach, such as one beside a home server you want to read.

`sources.data_dir` is where file sources live, relative to the working directory.
A file source cannot read outside it, including through a symbolic link, and the
server refuses to start if it overlaps `config/`. Both settings take effect on
restart.

### Auth modes

| `mode` | What it does | Use when |
|---|---|---|
| `none` | No check at all | Local development, bound to `127.0.0.1` |
| `token` | One shared bearer token on every request | Behind a private tunnel you control |
| `oauth` | Full OAuth 2.1 authorization server with PKCE (S256) | Connecting a real client such as Alexa+ |

`oauth` mode is what the Alexa+ MCP Toolkit requires. The server then also
publishes:

| Endpoint | Purpose |
|---|---|
| `/.well-known/oauth-authorization-server` | Authorization server metadata, advertising `S256` |
| `/.well-known/oauth-protected-resource/mcp` | Protected resource metadata (RFC 9728) |
| `/authorize` `/token` `/register` `/revoke` | The flow itself, including dynamic client registration |

An unauthenticated request to `/mcp` returns `401` with a `WWW-Authenticate`
header naming the resource metadata URL, which is how a client discovers where
to authenticate.

Because StackVoice is self-hosted there is no identity provider to delegate to
and only one user — you. The consent screen therefore asks for `auth.token`
rather than a username and password.

Clients that register themselves, and the refresh tokens they hold, are kept in
`config/oauth.json`, so a restart signs no one out. After a restart a client's
access token is refused, and its refresh token gets it a new one; access tokens
and authorization codes never leave memory. Refresh tokens last 30 days, rotate
on every use, and are stored only as SHA-256 digests. At most 100 clients are
kept, the one unused for longest going first, and each keeps its five newest
refresh tokens. The file is git-ignored: a client that registered with a client
secret keeps it there. To sign every client out, stop the server and delete
`config/oauth.json`.

### Wrong tokens and proxies

Three places take `auth.token`: the console's sign-in, `/mcp` in `token` mode,
and the consent screen in `oauth` mode. They share one counter per client
address. After 10 wrong tokens from one address, all three refuse that address
with `429` and a `Retry-After` header, even for the right token, until 15
minutes have passed since its first wrong token. A right token clears the
count. A request with no token at all does not count, because that is how a
client learns it needs one. The counter lives in memory, so a restart clears it.

`server.trusted_proxies`, a whole number from 0 to 5, decides which address is counted:

| Where the server runs | `trusted_proxies` | Why |
|---|---|---|
| Reached directly, or on localhost | `0` | Anyone could send an `X-Forwarded-For` header and claim a new address on every guess, so none is believed |
| Behind one proxy, such as a host's load balancer | `1` | Every request arrives from the proxy. Without this, one person guessing would lock out everyone |
| Behind a chain of proxies | The number in the chain | Each proxy adds the address it received from |

Each refused token is logged with the address that was counted. After
deploying behind a proxy, send one wrong token and compare that address with
your own public address. If it is not yours, raise `trusted_proxies` by one.

The console's session cookie is marked `Secure` whenever the browser reached
the server over HTTPS, including through a proxy that says so in
`X-Forwarded-Proto`. Over plain HTTP on localhost it is not, because a browser
would refuse to keep it.

## 3. App file — `config/apps/{id}.yml`

An **app** is your data project exposed to the assistant (e.g. your
`information-hub`, `eventpulse`, or any future project). One app = one file.

```yaml
# ── identity ──────────────────────────────────────────────
id: library                      # tool namespace prefix; ^[a-z][a-z0-9-]{1,31}$
label: "Deep-dive library"       # short human name (used in tool descriptions)
description: >                   # what this app is; the assistant reads this
  A deep-dive intelligence library: collected articles with
  region/topic classification and verification.
enabled: true                    # false → no tools generated for this app

# ── primitives: which verbs become tools ──────────────────
primitives:
  search: true     # exposes  library_search(query?, topic?, region?, limit)
  read: true       # exposes  library_read(key)
  status: true     # exposes  library_status()

# ── data sources: what the verbs operate on ───────────────
sources:
  - id: library                  # unique within this app
    type: github-repo            # github-repo, url or file (see §5)
    repo: SatPaingOo/information-hub
    views_dir: data/views        # public JSON read models
    stats_file: data/views/stats.json
    label: "deep-dive library"   # used in descriptions ("search the deep-dive library")

# ── shortcuts live in config/shortcuts.yml (§7.5) ─────────
shortcuts: []
```

### Rules
- Filename must equal `id` (`library.yml` ↔ `id: library`).
- `id` regex: `^[a-z][a-z0-9-]{1,31}$` — no uppercase, no underscores; used in
  tool names.
- App ids must be unique; source ids unique within an app.
- `primitives.*` default `false`; tools are generated only for enabled verbs.
- An app may list more than one source, and each is validated, but the verbs
  read only the first. Fan-out across sources is not built.

## 4. Tool naming & exposure

For an enabled app `{id}` with a single source:

| Primitive | Tool | Input (zod) | Output |
|---|---|---|---|
| search | `{id}_search` | `query?`, `topic?`, `region?`, `limit` (default 5, max 10) | compact list: titles + dates + 1-line summary |
| read | `{id}_read` | `key` (record id or URL) | full record, spoken-friendly |
| status | `{id}_status` | — | per-app health: last run, last data date, counts, errors |

Global tools:

| Tool | Input | What it does |
|---|---|---|
| `stack_status` | — | One health summary across all apps |
| `whats_new` | `app?` (an app id) | What arrived since the owner last asked: per app, the entries dated after the newest one already reported, and the newest titles. Offered once at least one app is enabled |

`whats_new` is the one tool with memory. For each app it keeps the date of the
newest entry it reported and when, in `config/seen.json`, so "what's new?" means
"since I last asked" across conversations and restarts. The first time it asks
about an app it starts tracking it and names the newest entry. An app whose
entries carry no dates is never called new. The console's **Try it** runs it
without moving the mark, and deleting the file only makes it start tracking
again.

Each shortcut `name` → one tool `{snake_case(name)}` that runs its blocks (§7.5). Each `{slot}` in its
phrases becomes a required text input on that tool.

### The answer card (MCP Apps)

`{id}_search`, `{id}_read` and `whats_new` also link their results to a view,
`ui://stackvoice/answer-card`, following the MCP Apps extension (spec
2026-01-26). A host with a screen that supports MCP Apps fetches it with
`resources/read` and shows the entries behind the spoken answer: titles, dates,
topics and summaries. A host without MCP Apps ignores it and keeps the text.
The card loads nothing from the network and needs no configuration.

Tool descriptions are **generated from the app's `label`/`description`** so the
assistant knows *when* to call them ("Use when the user asks about their
deep-dive library, e.g. 'what did you find about AI this week?'").

## 5. Source types

| type | Reads | Fields | Status reports |
|---|---|---|---|
| `github-repo` | JSON read models from a public repository | `repo`, `branch`, `views_dir`, `index_file`, `stats_file`, `items_path`, `fields`, `status_fields` | Last GitHub Actions run, and freshness and count from the stats document |
| `url` | JSON, RSS, Atom or CSV from an http or https address | `url`, `format` (`json`, `rss`, `atom` or `csv`), `headers`, `items_path`, `fields` | Record count and the newest date among the records |
| `file` | JSON, RSS, Atom or CSV from a file in `sources.data_dir` | `path`, `format`, `items_path`, `fields` | Record count and the newest date among the records |

Every type supports search, read and status. A feed is flattened on the way in:
its entries sit under `items`, each with `id`, `title`, `summary`, `date`, `link`,
`category` and `author`, with HTML stripped and dates in ISO form.

### A url source with a key

```yaml
sources:
  - id: projects
    type: url
    label: "projects"
    url: "https://api.example.com/v1/projects"
    format: json
    # The value references a saved key. The key itself is in config/secrets.yml.
    headers:
      Authorization: "Bearer {{secret:PROJECTS_KEY}}"
    items_path: data.items
    fields:
      key: id
      title: name
      summary: description
      date: created_at
      topic: null
      region: null
      url: html_url
```

An address may not carry credentials, such as `https://user:pass@…`, because it
would then be written into the app file. `Host`, `Cookie`, `Content-Length`,
`Transfer-Encoding` and `Connection` cannot be set as headers.

### A file source

```yaml
sources:
  - id: gold
    type: file
    label: "gold prices"
    path: "prices.csv"          # inside sources.data_dir; no "..", drive letter or leading slash
    format: csv
    fields:
      key: Date
      title: "{Date}: {Price}"  # a template: rows with no title of their own get one
      summary: null
      date: Date
      topic: null
      region: null
      url: null
```

### 5.1 Mapping a payload you did not design (`fields`, `status_fields`)

No two data projects name their fields the same way. Rather than force every app
into one schema — or write an adapter per app — a source declares where each
normalized field lives. This is the whole config-driven claim in one block:

```yaml
    items_path: recent_events   # omit when the document is already a list
    index_file: data/views/index.json   # defaults to {views_dir}/index.json
    fields:
      key: id                   # library calls it "key", markets calls it "id"
      title: summary
      summary: summary
      date: date_utc            # library calls it "date"
      topic: event_type
      region: region
      url: url
    status_fields:
      last_data_date: updated_at
      item_count: stats.events  # dot paths reach into nested documents
```

Every value is a path into the source's own payload; `fields` feeds the search
and read verbs, `status_fields` feeds the status verb. Both accept dot paths. A
`fields` value may also be a template that combines several paths, such as
`"{Date}: {Price}"`; when part of it is missing, the separators around that part
are dropped. Quote a template in YAML, or it reads as a map. `status_fields` is
used by `github-repo` sources only.
An app whose entries have no topic sets `topic: null` and the topic filter simply
never matches it.

The two shipped apps prove the point: `library` publishes a flat array whose
summary field is called `tldr`, `markets` publishes its events nested under
`recent_events` with entirely different names. One adapter serves both, and it
contains no reference to either app.

## 6. Worked examples (shipped defaults = demo persona)

### `config/apps/library.yml` (information-hub)

```yaml
# Demo persona app 1: information-hub (deep-dive library).
# See CONFIGURATION.md §3 for the full reference.

id: library
label: "Deep-dive library"
description: >
  Daily deep-dive articles on world news, tech, politics and products,
  verified and classified by region and topic.
enabled: true
primitives:
  search: true
  read: true
  status: true
sources:
  - id: library
    type: github-repo
    repo: SatPaingOo/information-hub
    views_dir: data/views
    stats_file: data/views/stats.json
    label: "deep-dive library"
    # This app already publishes an array of items at data/views/index.json,
    # so no items_path is needed.
    fields:
      key: key
      title: title
      summary: tldr          # this app calls the summary "tldr"
      date: date
      topic: topic
      region: region
      url: source_url
    status_fields:
      last_data_date: last_date
      item_count: total_items
shortcuts: []   # shortcuts live in config/shortcuts.yml (§7.5)
```

### `config/apps/markets.yml` (eventpulse)

```yaml
# Demo persona app 2: eventpulse (market intelligence).
#
# This app proves the config-driven claim: its payload looks nothing like the
# library's. Its items are nested under a key rather than being the whole
# document, and every field has a different name. Both differences are handled
# here in config — no adapter code knows about either app.

id: markets
label: "Market intelligence"
description: >
  Event-driven market intelligence: tracks global events and explains why
  gold, oil and major stocks moved.
enabled: true
primitives:
  search: true
  read: true
  status: true
sources:
  - id: markets
    type: github-repo
    repo: SatPaingOo/eventpulse
    views_dir: data/views
    # The status verb reads freshness and volume from here. This app publishes
    # both inside its index document rather than a separate stats file.
    stats_file: data/views/index.json
    label: "market intelligence"
    items_path: recent_events   # the items are nested, not the whole document
    fields:
      key: id
      title: summary            # an event's headline is its summary
      summary: summary
      date: date_utc
      topic: event_type
      region: region
      url: url
    status_fields:
      last_data_date: updated_at
      item_count: stats.events
shortcuts: []
```

> The two apps look nothing alike on the wire: `library` is a flat array of
> articles, `markets` nests its events under `recent_events` and names every
> field differently. Both expose the same three tools, and the difference lives
> entirely in `items_path` and `fields`.
>
> Primitives stay per-app: set any of `search`/`read`/`status` to `false` and the
> catalog simply generates fewer tools for that app.

## 7. Adding your own app

### The easiest way

Open `/console`, click **Add an app**, paste your source, check the inferred
mapping, save. Everything below describes what that dialog is doing.

### From a terminal

```bash
npm run stackvoice -- app add mynotes --from me/my-pipeline
npm run stackvoice -- app add news --from https://example.com/feed.xml
npm run stackvoice -- app add gold --from prices.csv
```

StackVoice works out what was pasted, reads it, finds where the records live and
which field feeds each spoken field, prints what it inferred with a sample value
from your own data, and writes `config/apps/<id>.yml`.

**For a link or a file,** the format comes from the content: a body that starts
like JSON is JSON, `<rss>` is RSS, `<feed>` is Atom, and rows with a consistent
number of cells are CSV. An ordinary web page is refused with a hint to find its
feed. If the document is an object, the most readable list inside it becomes the
records. A record with no title-like field gets a template built from its first
two text columns.

**For a GitHub repository,** it looks for these, in order:

| Looking for | Paths tried |
|---|---|
| The records | `data/views/index.json`, `data/views/items.json`, `data/index.json`, `views/index.json`, `docs/data/index.json`, `index.json` |
| Freshness and counts | `data/views/stats.json`, `data/views/status.json`, `data/views/summary.json`, `data/stats.json`, `data/status.json`, then the index document itself |

If the index document is an object rather than an array, every array inside it is
a candidate and the most *readable* one wins — the one that can fill the most
spoken fields, not the longest. A list of price rows loses to a shorter list of
events with titles and dates.

Two things it will not do. It never names a field that is not in your data, so a
mapping that comes back `null` really is absent rather than a broken guess. And
if no record carries a title or a summary, it refuses to write the app and tells
you which keys it did see, because a tool that can fetch but has nothing to say
is worse than no tool.

Useful flags: `--branch` for a non-default branch, `--label` for the human name
used in tool descriptions, and `--description` for what the assistant reads when
deciding whether to call this app.

### The long way

Everything above just writes YAML, so you can write it yourself:

1. `cp config/apps/library.yml config/apps/myapp.yml`
2. Edit `id`, `label`, `description`, the source `repo`, and the field maps (§5.1).
3. `npm run stackvoice -- app validate myapp`

### Picking it up

The server watches `config/apps/` and `config/shortcuts.yml`, and reloads when
either changes. Each MCP session
reads the registry when it connects, so the next conversation sees the new tools
without a restart. A file that fails to parse is logged and ignored: the running
server keeps the config it already validated rather than going dark.

## 7.5 Shortcuts — `config/shortcuts.yml`

A shortcut is one tool that runs a flow of blocks, the way a shortcut on a phone
does. "What's my morning brief" is two questions (what is new in every app since
I last asked, and is my stack healthy), and a shortcut answers both in one call,
in the same order every time. Its blocks decide what gets said: ask a tool, check the answer, say
something, stop.

```yaml
shortcuts:
  - name: "news about topic"          # becomes the tool news_about_topic
    description: "What the library has on a subject, or that it has nothing yet."
    enabled: true
    triggers: ["news about {topic}", "anything on {topic}"]
    blocks:
      - ask: "library_search"
        with: {"query": "{topic}", "limit": 3}
        as: "found"
      - if: {"count_of": "found", "is": 0}
        then:
          - say: "Nothing about {topic} yet."
          - stop: true
      - say: "{found.count} stories about {topic}. The newest is {found.first.title}, from {found.first.when}."
```

| Field | Meaning |
|---|---|
| `name` | Becomes the tool name: `news about topic` → `news_about_topic` |
| `description` | The assistant reads this to decide when to run it |
| `triggers` | Up to five ways to say it. `{topic}` is a slot the person fills in. Every phrase needs the same slots, at most three, and words around them. Each slot becomes a required text input on the tool: the assistant fills it, and the simulator fills it from what was said. Empty means the name is the phrase |
| `blocks` | What runs, in order |
| `enabled` | `false` generates no tool |

### Blocks

| Block | What it does |
|---|---|
| `ask: "tool"`, `with: {…}`, `as: "name"` | Calls a tool this server exposes and saves its answer. Text arguments are templates, and one that comes out empty is left out, so `{topic}` with no topic searches everything |
| `if: {…}`, `then: […]`, `otherwise: […]` | Runs one branch. An If can sit inside another If, but no deeper |
| `say: "text"` | Adds a sentence to the answer |
| `get: "function"`, `from: "name"`, `as: "name"` | Saves one thing read from a value. `index` picks the entry for `item`, counted from 1 |
| `set: "name"`, `to: "text"` | Saves text under a name |
| `stop: true` | Ends the flow and answers with what has been said |

**Conditions.** `{"count_of": "found", "is": 0}`, or `more_than` / `less_than`.
`{"text": "{found.first.title}", "contains": "gold"}`, or `is`, `is_empty: true`,
`is_not_empty: true`; case and surrounding spaces do not matter. `{"failed": "found"}`
is true when that Ask block's tool failed.

**Templates.** `{name}` is a slot or something a block saved, and dots read from
it. An answer on its own reads as what the tool said; `count`, `first`, `last`,
`titles`, `title`, `summary`, `date`, `when`, `link`, `topic`, `region` and `key`
read from its entries. `{found.first.when}` says "yesterday" or "on September 1"
rather than a timestamp, and `{found.titles}` says "a, b and c".

**Limits.** At most 16 blocks and 4 Ask blocks, counted across every branch, so
the slowest answer is still quick. No block runs code and nothing loops. A name
that nothing sets, or a function that does not exist, is refused when the file
loads or the console saves, so a typo is caught before anyone hears a gap.

A tool that fails does not sink the answer. Its failure is saved like any other
answer, so `{"failed": "found"}` can speak around it. A flow that says nothing
answers with what its tools said.

**Written before flows?** A shortcut with `steps` and a `reply` still loads and
answers exactly as it did: each step becomes an Ask block saved as `step1`,
`step2`, and `{1}`, `{2}` or `{results}` in the reply become a Say. The next save
writes it as blocks, and the old file is kept in `config/backups/`.

Shortcuts live in their own file because they span apps: `morning brief` asks
`whats_new` about every app and then `stack_status`, and belongs to no one app. A shortcut can never
shadow a generated tool; if the names collide, the app's own tool wins.

**Easiest way to write one:** the Shortcuts page in the console builds the flow
block by block. Phrases show the slots they leave, every text field has an Insert
menu of the names that exist so far, and Try it runs the draft with a value for
each slot and lists every block that ran, before anything is saved.

## 8. Validation & failure semantics

- **Startup:** registry loads and validates every app file; any error fails the
  boot with the offending file + field named (fail-fast — a broken config must
  never silently half-expose tools).
- **Runtime:** a source that errors (network, missing file, malformed JSON)
  returns a typed error for that call only; `{id}_status` reports it; the server
  stays up. Management `validate` runs the same rules without restarting.
- **Removal:** config files are the source of truth; management writes go through
  the ConfigStore port with atomic write + timestamped backup.

---

Last reviewed: 2026-10-04
