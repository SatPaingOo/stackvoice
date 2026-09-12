# StackVoice — Configuration

**Config is the product.** A user never edits code — they add/edit YAML in
`config/`, run the server, and their assistant gets new tools. This doc is the
v1 schema + validation rules + worked examples. Companion: ARCHITECTURE.md §4.

---

## 1. Layout

```
config/
├─ settings.yml        # server + management behavior (one file)
└─ apps/
   ├─ library.yml      # one app = one file (name must equal app id)
   ├─ markets.yml
   └─ … (user adds more)
```

## 2. `config/settings.yml`

```yaml
server:
  host: 127.0.0.1          # default localhost; set 0.0.0.0 behind a tunnel/proxy
  port: 8765
  log_level: info          # debug | info | warn | error

auth:
  mode: none               # none | token | oauth
  token: ""                # shared token in "token" mode; consent secret in "oauth" mode
  public_url: ""           # required in "oauth" mode, e.g. https://stackvoice.example.com

console:
  enabled: true            # web console at /console — add and edit apps in a browser

simulator:
  enabled: true            # serves the simulated Alexa+ page at /simulator

management:
  cli: true                # CLI face enabled (primary)

cache:
  ttl_seconds: 300         # per-URL cache for fetched JSON / API calls
```

### The console

`console.enabled` serves a page at `/console` for adding and editing apps in a
browser: paste a repository, review the inferred mapping, correct it, save. A
save takes effect at once.

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
rather than a username and password. Tokens live in memory: restarting the
server signs every client out.

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
    type: github-repo            # v1 supported type (see §5)
    repo: SatPaingOo/information-hub
    views_dir: data/views        # public JSON read models
    stats_file: data/views/stats.json
    label: "deep-dive library"   # used in descriptions ("search the deep-dive library")

# ── shortcuts (optional macro layer) ──────────────────────
shortcuts:
  - name: "morning brief"
    description: "Top library items plus overall stack health in one answer."
    steps:
      - {tool: library_search, args: {limit: 3}}
      - {tool: stack_status, args: {}}
    reply: "Here is your brief: {results}"
```

### Rules
- Filename must equal `id` (`library.yml` ↔ `id: library`).
- `id` regex: `^[a-z][a-z0-9-]{1,31}$` — no uppercase, no underscores; used in
  tool names.
- App ids must be unique; source ids unique within an app.
- `primitives.*` default `false`; tools are generated only for enabled verbs.
- A source may be added later; multi-source apps are supported (verbs fan out
  per source when the verb targets a source id).

## 4. Tool naming & exposure

For an enabled app `{id}` with a single source:

| Primitive | Tool | Input (zod) | Output |
|---|---|---|---|
| search | `{id}_search` | `query?`, `topic?`, `region?`, `limit` (default 5, max 10) | compact list: titles + dates + 1-line summary |
| read | `{id}_read` | `key` (record id or URL) | full record, spoken-friendly |
| status | `{id}_status` | — | per-app health: last run, last data date, counts, errors |

Global: `stack_status()` — one summary across all apps.

Each shortcut `name` → one tool `{snake_case(name)}` running its steps in order.

Tool descriptions are **generated from the app's `label`/`description`** so the
assistant knows *when* to call them ("Use when the user asks about their
deep-dive library, e.g. 'what did you find about AI this week?'").

## 5. Source types

| type | v1? | Fields | Verbs supported |
|---|---|---|---|
| `github-repo` | ✅ | `repo`, `views_dir`, `stats_file`, `index_file`, `items_path`, `fields`, `status_fields` | search / read / status (index views + Actions runs) |
| `json-url` | planned | `url`, `items_path` | search / read |
| `rss` | planned | `url`, `limit` | search (fetch → normalize items) |
| `api` | planned | `url_template`, `auth_env` | search (GET) |

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
and read verbs, `status_fields` feeds the status verb. Both accept dot paths.
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
shortcuts:
  - name: "morning brief"
    description: "Latest deep-dives plus overall stack health, in one answer."
    steps:
      - {tool: library_search, args: {limit: 3}}
      - {tool: stack_status, args: {}}
    reply: "Here is your brief: {results}"
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

Open `/console`, click **Add an app**, paste your repository, check the inferred
mapping, save. Everything below describes what that page is doing.

### From a terminal

```bash
npm run stackvoice -- app add mynotes --repo me/my-pipeline
```

StackVoice fetches your read models, works out where the records live and which
payload field feeds each spoken field, prints what it inferred with a sample
value from your own data, and writes `config/apps/mynotes.yml`.

What it looks for, in order:

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

The server watches `config/apps/` and reloads when it changes. Each MCP session
reads the registry when it connects, so the next conversation sees the new tools
without a restart. A file that fails to parse is logged and ignored: the running
server keeps the config it already validated rather than going dark.

## 8. Validation & failure semantics

- **Startup:** registry loads and validates every app file; any error fails the
  boot with the offending file + field named (fail-fast — a broken config must
  never silently half-expose tools).
- **Runtime:** a source that errors (network, missing file, malformed JSON)
  returns a typed error for that call only; `{id}_status` reports it; the server
  stays up. Management `validate` runs the same rules without restarting.
- **Removal:** config files are the source of truth; management writes go through
  the ConfigStore port with atomic write + timestamped backup.
