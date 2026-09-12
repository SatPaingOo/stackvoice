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

management:
  cli: true                # CLI face enabled (primary)
  web_console: false       # local dashboard (planned, stage 5)
  admin_mcp_tools: false   # expose admin_* tools over MCP (opt-in; see MANAGEMENT.md)
  auth_token: ""           # optional shared token required when server is public

cache:
  ttl_seconds: 300         # per-URL cache for fetched JSON / API calls
```

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
| `github-repo` | ✅ | `repo`, `views_dir`, `stats_file` | search / read / status (Actions + commits + stats) |
| `json-url` | planned | `url`, `items_path` | search / read |
| `rss` | planned | `url`, `limit` | search (fetch → normalize items) |
| `api` | planned | `url_template`, `auth_env` | search (GET) |

## 6. Worked examples (shipped defaults = demo persona)

### `config/apps/library.yml` (information-hub)

```yaml
id: library
label: "Deep-dive library"
description: >
  Daily deep-dive articles on world news, tech, politics and products,
  verified and classified by region and topic.
enabled: true
primitives: {search: true, read: true, status: true}
sources:
  - id: library
    type: github-repo
    repo: SatPaingOo/information-hub
    views_dir: data/views
    stats_file: data/views/stats.json
    label: "deep-dive library"
shortcuts:
  - name: "morning brief"
    description: "Latest deep-dives plus overall stack health."
    steps:
      - {tool: library_search, args: {limit: 3}}
      - {tool: stack_status, args: {}}
    reply: "Here is your brief: {results}"
```

### `config/apps/markets.yml` (eventpulse)

```yaml
id: markets
label: "Market intelligence"
description: >
  Event-driven market intelligence: tracks global events and explains
  why gold, oil and major stocks moved.
enabled: true
primitives: {search: false, read: true, status: true}
sources:
  - id: markets
    type: github-repo
    repo: SatPaingOo/eventpulse
    views_dir: data/views
    stats_file: data/views/status.json
    label: "market intelligence"
shortcuts: []
```

> `markets` enables `read`/`status` only — a realistic example of an app that is
> *not* a searchable text library. The registry + catalog handle asymmetric
> primitives per app.

## 7. Adding your own app (the "no code" story)

1. `cp config/apps/library.yml config/apps/myapp.yml`
2. Edit `id`, `label`, `description`, sources (your repo(s)), primitives.
3. `stackvoice app validate myapp` (or let startup validate).
4. Restart the server → tools `myapp_search`, `myapp_read`, `myapp_status`
   appear automatically.
   Or: `stackvoice app add --from-template library --id myapp` (management CLI).

## 8. Validation & failure semantics

- **Startup:** registry loads and validates every app file; any error fails the
  boot with the offending file + field named (fail-fast — a broken config must
  never silently half-expose tools).
- **Runtime:** a source that errors (network, missing file, malformed JSON)
  returns a typed error for that call only; `{id}_status` reports it; the server
  stays up. Management `validate` runs the same rules without restarting.
- **Removal:** config files are the source of truth; management writes go through
  the ConfigStore port with atomic write + timestamped backup.
