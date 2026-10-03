# StackVoice — Architecture

Technical architecture of a self-hosted MCP server that turns any feed, API,
spreadsheet, repository or file into tools, with a management console, a CLI and
a simulated Alexa+ client. **OOP + SOLID + Clean/Hexagonal (Ports & Adapters).**
Companion docs: CONFIGURATION.md (schemas), MANAGEMENT.md (the console and CLI),
CODING_STANDARDS.md (rules of the code).

---

## 1. Goals & non-goals

**Goals**
- A source of any supported kind becomes tools through config alone; adding one
  never touches core code.
- One MCP server exposes tools for every app, each in its own namespace.
- Every face, console, CLI and simulator, sits on the same application services.
- Domain and application layers are pure TypeScript: no MCP SDK, no framework,
  no I/O. Everything external goes through ports, so the core is unit-testable
  in milliseconds.
- Voice-agnostic: the server speaks MCP; Alexa+ is the target, any MCP client
  works.
- **Voice-shaped output:** every tool result is short enough to be spoken.
  Adapters return records; the response shaper returns sentences. The Alexa+
  round-trip budget is 500 ms.

**Non-goals**
- No LLM inside the server. The client is the brain.
- No writing back to sources.
- No multi-tenant hosting. One server, one owner.

## 2. Architecture style

Clean Architecture with a single dependency rule, expressed as Ports & Adapters:

```text
                ┌───────────────────────────────────────────────┐
                │  presentation/  MCP · console · CLI · sim     │  → adapts the app layer to the world
                └──────────────────┬────────────────────────────┘
                                   │ depends on
                ┌──────────────────▼────────────────────────────┐
                │  application/   use-case services             │  → orchestrates the domain via ports
                └──────────────────┬────────────────────────────┘
                                   │ depends on
                ┌──────────────────▼────────────────────────────┐
                │  domain/        entities · ports · errors     │  ← the core: no I/O, no SDK
                └──────────────────▲────────────────────────────┘
                                   │ implements ports
                ┌──────────────────┴────────────────────────────┐
                │  infrastructure/ adapters: HTTP, YAML, OAuth  │  ← knows GitHub, feeds, files
                └───────────────────────────────────────────────┘
```

**Dependency rule:** source-code dependencies point inward. `domain/` knows
nothing about `application/`, `infrastructure/`, `presentation/`, the MCP SDK,
zod or YAML. `infrastructure/` implements `domain/ports/*`. Wiring happens once
in the composition roots, `src/main.ts` and `src/cli.ts`.

## 3. Layer contents

### domain/ — entities, ports, errors

| File | Responsibility |
|---|---|
| `app-definition.ts` | One app: id, label, description, enabled, primitives, sources. Owns its invariants: id format, at least one source, unique source ids |
| `data-source.ts` | One source: a location that is a GitHub repository, a URL with a format and header references, or a file in the data folder, plus its field map. Validates the location: http or https only, no credentials in an address, no `..` in a file path |
| `item.ts` | The normalized record every reader returns |
| `ranking.ts` | Search ranking over items, as a pure function |
| `health.ts` | The health payload shared by the status tools and the management faces |
| `shortcut.ts` | A shortcut: name, phrases with slots, and a flow of blocks. Owns the name-to-tool-name rule and knows its slots |
| `flow.ts` | The six kinds of block. Parses untrusted blocks with field paths and validates what a flow means: limits, shared slots, and that every name used is set |
| `source-proposal.ts` | What an inspector inferred about a source, with a sample per field |
| `tool-spec.ts` | A neutral description of a tool to expose: name, title, description, verb, and for a shortcut its slots and phrases. No SDK types |
| `settings.ts` | Server settings as the core sees them |
| `errors.ts` | Typed errors: `AppNotFoundError`, `ValidationError`, `SourceUnavailableError`, `ConfigError` |

| Port | Methods |
|---|---|
| `ports/config-store.ts` | `listApps() · getApp(id) · saveApp(app) · removeApp(id)` |
| `ports/data-source-reader.ts` | `search · read · status` per source, and a factory that picks the reader for a source type |
| `ports/source-inspector.ts` | `inspect(target)` returns a proposal for a source nobody has configured |
| `ports/secret-store.ts` | `get · names · set · remove`. There is deliberately no way to list values |
| `ports/settings-store.ts` | `load · save` |
| `ports/shortcut-store.ts` | `list · save` |
| `ports/tool-caller.ts` | `callTool(name, args)`: how the simulator reaches the server |
| `ports/logger.ts` | Structured `debug · info · warn · error` and child scopes |

### application/ — use-case services

| Service | Responsibility |
|---|---|
| `app-registry.service.ts` | Load, list and get apps through the ConfigStore port |
| `tool-catalog.service.ts` | Apps and shortcuts in, `ToolSpec[]` out: the config-to-tools step, as a pure function |
| `search/read/status.service.ts` | One use case per verb: pick the reader for the source, run it |
| `health.service.ts` | Per-app and stack-wide health |
| `management.service.ts` | Add from any source, upsert, enable, disable, validate and remove apps; save and remove shortcuts. Every safety rule lives here |
| `source-input.ts` | Works out what was pasted: a GitHub repository, a link or a file |
| `response-shaper.ts` | Records into spoken text: word budget, dates in words, "and N more" |
| `tool-runner.service.ts` | Runs any generated tool by name. The MCP layer and shortcuts both dispatch through it |
| `shortcut-registry.service.ts` | Holds the loaded shortcuts |
| `shortcut.service.ts` | Interprets a flow block by block with an injected clock, and returns the answer with a trace of every block that ran |
| `flow-values.ts` | What a flow's variables hold, and the functions that read them for templates and conditions |
| `intent-planner.ts` | The simulator's stand-in for the assistant: matches phrasings and shortcut phrases to a tool call. Rules, not a model |
| `conversation.service.ts` | One simulated turn: plan, call through the ToolCaller port, speak, carry context |

### infrastructure/ — adapters

| Adapter | Implements | Notes |
|---|---|---|
| `adapters/github-repo.adapter.ts` | DataSourceReader | Read models from raw.githubusercontent.com; last run from the GitHub Actions API |
| `adapters/url.adapter.ts` | DataSourceReader | Links and files: fetch or read, parse, locate the records, map fields. Status is the record count and newest date |
| `adapters/github-repo.inspector.ts` · `url.inspector.ts` · `composite.inspector.ts` | SourceInspector | The composite routes a target to the inspector for its type |
| `adapters/adapter-factory.ts` | DataSourceReaderFactory | Source type to reader |
| `adapters/records.ts` | — | Shared by every source type: find the most readable list, infer fields, render templates, normalize dates |
| `adapters/data-file.ts` | — | Reads a file source by real path, refusing anything outside the data folder |
| `formats/detect.ts` · `parse.ts` | — | Format from the body, not the address; RSS and Atom flattened to one record shape; CSV delimiter detection; XML entity declarations refused |
| `http/http-client.ts` | — | Timeout, one retry, TTL cache keyed by URL and a header fingerprint; for links, a 5 MB cap and redirects followed by hand |
| `http/network-guard.ts` | — | Refuses private, loopback and cloud metadata addresses on every redirect hop, including IPv4-mapped IPv6 |
| `http/ttl-cache.ts` | — | In-memory cache, 300 s by default |
| `config/yaml-config-store.ts` | ConfigStore | `config/apps/*.yml`; atomic write and backup |
| `config/yaml-shortcut-store.ts` | ShortcutStore | A hand-writable block shorthand; still reads shortcuts written before flows |
| `config/yaml-settings-store.ts` | SettingsStore | `config/settings.yml` |
| `config/yaml-secret-store.ts` | SecretStore | `config/secrets.yml`, owner-readable only; `STACKVOICE_SECRET_*` wins |
| `config/secret-headers.ts` | — | Fills `{{secret:NAME}}` into a request at the last moment, in memory |
| `config/*.schema.ts` | — | zod schemas for every file |
| `config/config-watcher.ts` | — | Reloads the registries when a file in `config/apps/` changes. Saves from the console reload directly |
| `auth/local-oauth-provider.ts` · `consent-page.ts` | — | OAuth 2.1 authorization server with PKCE (S256) and dynamic client registration; tokens in memory |
| `mcp/mcp-loopback-client.ts` | ToolCaller | A real MCP SDK client pointed at the server's own endpoint |
| `logging/pino.logger.ts` | Logger | Structured JSON |
| `system-clock.ts` | — | The one place that reads the time |

### presentation/ — thin faces

| Face | Files | Responsibility |
|---|---|---|
| MCP server | `mcp/http-server.ts`, `mcp/server-factory.ts`, `mcp/tool-mapper.ts` | Streamable HTTP sessions and the three auth modes; one `McpServer` per session from the catalog; `ToolSpec` to a registration with zod input and output schemas, a shortcut's slots becoming required inputs; the one place an error becomes a tool result |
| CLI | `cli.ts`, `cli/commands.ts` | Management from a terminal |
| Web design system | `web/theme.ts`, `web/layout.ts`, `web/components-css.ts` | Shared tokens, page shell and component styles, so every page reads as one product |
| Landing | `web/landing.ts` | The idea in ten seconds, with live numbers from the running stack |
| Web console | `console/routes.ts` and one page file per route | JSON API over `ManagementService` and the stores, plus server-rendered page frames |
| Web client | `web/client/`, compiled by `tsconfig.client.json` to `dist/public`, served at `/assets` | Browser components as classes with no framework: `Modal`, `ConfirmDialog`, form controls, and per-screen forms such as `AppFormModal`. Each screen's entry file is its composition root. Forms depend on gateway interfaces such as `AppsGateway`, never on `fetch`. A new source type is a new `LocationEditor`; a new kind of block is one editor class chosen in `createBlockEditor`, and an If gets its branches from a `FlowContext`, so no editor imports another |
| Simulator | `simulator/routes.ts`, `simulator/page.ts` | The simulated Alexa+ page; drives the server through the loopback MCP client |

## 4. Multi-app design

- An **app** is a named, enabled or disabled bundle of a label, primitives and
  sources. Files live in `config/apps/*.yml`, and a filename must match its id.
- The **registry** loads every file at startup and fails fast on a broken one,
  naming the file and field.
- **Tool namespace:** an enabled app exposes `{id}_search`, `{id}_read` and
  `{id}_status` for each verb its primitives turn on. The global tool is
  `stack_status`.
- **Adding an app** means writing a validated file, through the console, the CLI
  or by hand. The watcher reloads the registry; no restart and no code change.
- **Several sources:** an app file may list more than one, but the verbs read the
  first. Fan-out across sources is not built.
- **Shortcuts** live in `config/shortcuts.yml` because they span apps. Each
  becomes one tool that runs its flow, with a required input per slot. A shortcut
  never shadows a generated tool.

```text
AppDefinition
 ├─ sources[]   → the first is read, by the reader its type selects
 └─ primitives  → which verbs become tools
Shortcut
 ├─ triggers[]  → phrases; their slots become tool inputs
 └─ blocks[]    → the flow the tool runs
```

## 5. Management subsystem

One `ManagementService` is the single source of truth. Every face is a thin
adapter over it:

```text
CLI ──────────┐
Web console ──┼──► ManagementService ──► ConfigStore ─────► config/apps/*.yml
              │         │
              │         ├──► SourceInspector ──► CompositeSourceInspector
              │         │                          ├─ GithubRepoInspector
              │         │                          └─ UrlSourceInspector (links, files)
              │         ├──► ShortcutStore ────► config/shortcuts.yml
              │         └──► HealthService · AppRegistryService (read paths)
              │
Console only ─┴──► SecretStore ─────► config/secrets.yml
                   SettingsStore ───► config/settings.yml
```

Operations: list, show, validate, inspect, add from a source, upsert, enable,
disable, remove, and save or remove a shortcut. Safety rules live in the service
so every face inherits them. Full list: MANAGEMENT.md §3.

## 6. SOLID mapping

| Principle | Where it shows up |
|---|---|
| **S** | One reason to change per class: `AppDefinition` (invariants) ≠ `ToolCatalogService` (config to tools) ≠ `UrlSourceReader` (reading links and files) ≠ `ManagementService` (registry changes) ≠ `ToolMapper` (MCP shape) |
| **O** | A new source type is a reader, an inspector, one factory entry and a `LocationEditor`; the services, catalog and form are untouched. A new kind of block is a parser case, an interpreter case and an editor class |
| **L** | Every `DataSourceReader` returns the same shapes and error semantics. The GitHub reader and the URL reader are interchangeable to every caller |
| **I** | Ports stay small: `ConfigStore` ≠ `ShortcutStore` ≠ `SecretStore` ≠ `DataSourceReader` ≠ `SourceInspector` ≠ `Logger`. The secret store has no method to read values back in bulk |
| **D** | `domain/` declares ports, `infrastructure/` implements them, the composition roots inject. In the browser, forms depend on gateway interfaces and each page's entry file wires them |

## 7. Design patterns used

- **Factory:** the reader for a source type, and the editor for a kind of block.
- **Composite:** one `SourceInspector` that routes to the inspector for a target.
- **Repository:** `ConfigStore`, `ShortcutStore` and `SecretStore` hide the files.
- **Registry:** apps and shortcuts load, validate and index once.
- **Interpreter:** `ShortcutService` runs a flow block by block and records a trace.
- **Mapper:** `ToolSpec` to MCP registration, so the SDK stays in presentation.
- **Gateway:** the console's browser code talks to the server only through
  `AppsGateway`, `ShortcutsGateway` and friends.
- **Composition root:** `main.ts`, `cli.ts`, and one entry file per console page.

## 8. Errors, logging, caching

- **Errors:** typed domain errors. Use cases return results or throw typed
  errors, and each face maps them once: MCP error text, CLI exit code, HTTP
  status. A field error carries its path, such as `blocks.2.then.0.text`, and the
  console turns that into "Block 3 › Then › 1".
- **Logging:** structured JSON through the Logger port, with tool names, app ids
  and secret names as fields. Never tokens, key values, file contents or the
  values a tool was called with. At debug level each fetched URL is logged in
  full.
- **Caching:** a TTL cache keyed by URL and a fingerprint of the request headers,
  300 s by default, warmed at startup so a tool call rarely waits on the network.

## 9. Testing strategy

| Layer | What is tested | How |
|---|---|---|
| domain | Invariants, flow parsing and validation, ranking | Plain unit tests, no I/O |
| application | Management, catalog, planner, shortcut interpreter, conversation | Fake ports and an injected clock |
| infrastructure | Format detection and parsing, network guard, inspectors, readers, YAML round trips, secrets | Fixture bodies, fake fetchers, temporary directories; no network |
| presentation | Console API, MCP tool registration and slot inputs, browser-side helpers | Express on a random port with real stores; the SDK's in-memory transport |
| end-to-end | Every page, the add-app and shortcut-builder dialogs, simulator voice and conversation | Playwright against the real server in the installed Edge, on a scratch copy of the config |

On 2026-09-13, 605 unit tests and 38 browser tests passed.

## 10. Directory structure

```text
StackVoice/
├─ config/
│  ├─ settings.yml
│  ├─ shortcuts.yml
│  ├─ apps/{app}.yml
│  ├─ secrets.yml            # git-ignored, created when a key is saved
│  └─ backups/               # git-ignored
├─ data/                     # git-ignored; file sources are read from here only
├─ src/
│  ├─ main.ts · cli.ts       # composition roots
│  ├─ domain/                # entities · ports · errors
│  ├─ application/           # use-case services
│  ├─ infrastructure/        # adapters · auth · config · formats · http · logging · mcp
│  └─ presentation/
│     ├─ mcp/  cli/  console/  simulator/
│     └─ web/                # theme, layout, landing
│        └─ client/          # browser components, compiled separately
├─ tests/
│  ├─ unit/                  # mirrors src/
│  └─ e2e/                   # Playwright
├─ docs/                     # everything outside the root doc set
├─ tsconfig.json             # server
└─ tsconfig.client.json      # browser
```

## 11. Key decisions

| Decision | Alternatives rejected | Why |
|---|---|---|
| The simulator calls the server over its own MCP endpoint | Calling the services in-process | The demo is only honest if it exercises the real transport and auth. If the loopback client can drive it, so can Alexa+ |
| No LLM in the server | A model to plan tool calls or phrase answers | The assistant already understands the user. A model inside would add cost, latency and non-determinism to a $0, 500 ms product |
| A local OAuth 2.1 authorization server | Delegating to an external identity provider | A self-hosted server has one owner and no provider. The Toolkit requires OAuth, not a particular provider |
| Format detected from the body | Trusting the content type or the file extension | Published sheets arrive as `text/plain` and feeds without `.xml`; both are wrong often enough to be useless |
| Keys stored apart and referenced as `{{secret:NAME}}` | Keys inside app files | App files can then be shared or committed, and the browser never needs a key value |
| Shortcut flows as six fixed blocks | User-written scripts or expressions | No code to sandbox, limits that can be checked on save, and a builder a non-developer can use |
| Console browser code as framework-free TypeScript classes | React or another framework | No new dependency and no bundler; one extra `tsc` project gives types and components |
| Server-rendered page frames with client dialogs | A single-page app with a client router | Every page stays linkable and reloadable with no router, and the landing page reads without script; only the forms need to be interactive |

## 12. Known issues (2026-10-04)

- The verbs read only an app's first source.
- OAuth tokens live in memory, and the simulator stands down in `oauth` mode.
- User-facing strings are hardcoded English. The project canon asks for i18n keys
  with English and Burmese values.
- The simulator's intent planner is English phrasing rules and misreads questions
  outside those patterns.
- A hand edit to `config/shortcuts.yml` is picked up only on restart or on the
  next change in `config/apps/`, because the watcher watches that folder only.
- A key placed in a URL's query string, rather than in a header, is not treated
  as a secret: it is written into the app file and appears in debug logs.
- Alexa+ account linking needs a statically registered OAuth client with a
  secret, all of Alexa's redirect URIs, and refresh tokens. The local
  authorization server supports only dynamic registration, in memory.
- In `token` mode the simulator's API is open: it calls `/mcp` with the token on
  the visitor's behalf, so anyone with the link can run the read-only tools.
- Wrong owner tokens are counted per address in memory. A guesser with many
  addresses gets ten guesses from each, and a restart clears every count.

---

Last reviewed: 2026-09-13
