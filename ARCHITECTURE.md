# StackVoice — Architecture

Technical architecture for a standards-compliant, config-driven, multi-app MCP
server with a management system. **OOP + SOLID + Clean/Hexagonal (Ports &
Adapters)**. Companion docs: CONFIGURATION.md (schemas), MANAGEMENT.md
(features/faces), CODING_STANDARDS.md (rules of the code).

---

## 1. Goals & non-goals

**Goals**
- Apps (user data projects) are first-class config artifacts; adding one never
  touches core code.
- One MCP server exposes tools for *all* apps; each app gets a stable tool
  namespace.
- A management system (list / health / add / remove / enable / validate) exists
  from day one, powered by the *same* application service behind every face.
- Domain and application layers are pure TypeScript: no MCP SDK, no framework,
  no I/O — everything external goes through ports (interfaces) so the core is
  unit-testable in milliseconds.
- Voice-agnostic: the server speaks MCP; Alexa+ is the story, any MCP client works.
- **Voice-shaped output:** every tool result is short enough to be spoken. A
  response shaper sits between the adapters and the MCP layer; adapters return
  read models, the shaper returns sentences. Round-trip budget: < 500 ms.

**Non-goals (now)**
- No LLM inside the server (the client is the brain).
- No write-back to data sources (read-first product).
- **Auth: OAuth 2.1 resource server (revised 2026-09-12).** The Alexa+ MCP
  Toolkit mandates OAuth 2.1 + PKCE (S256), `/.well-known/oauth-authorization-server`
  metadata, a `resource` parameter, and `401` on unauthenticated requests. The
  earlier "shared token only" non-goal is withdrawn; see FRAMEWORK.md §7 Stage 2.
- No multi-tenant SaaS.

## 2. Architecture style

Clean Architecture with a single dependency rule, expressed as Ports & Adapters:

```
                ┌───────────────────────────────────────────────┐
                │  presentation/   (MCP server · CLI · web ctl)  │  → adapts app layer to the world
                └──────────────────┬────────────────────────────┘
                                   │ depends on
                ┌──────────────────▼────────────────────────────┐
                │  application/    (use-case services)          │  → orchestrates domain via ports
                └──────────────────┬────────────────────────────┘
                                   │ depends on
                ┌──────────────────▼────────────────────────────┐
                │  domain/         (entities + ports + errors)  │  ← THE CORE (no I/O, no SDK)
                └──────────────────▲────────────────────────────┘
                                   │ implements ports
                ┌──────────────────┴────────────────────────────┐
                │  infrastructure/ (adapters: config, fetch…)   │  ← knows about GitHub, YAML, HTTP
                └───────────────────────────────────────────────┘
```

**Dependency rule:** source-code dependencies point *inward*. `domain/` knows
nothing about `application/`, `infrastructure/`, `presentation/`, the MCP SDK,
zod, or YAML. `infrastructure/` implements `domain/ports/*` interfaces.
Wiring happens once in a **composition root** (`src/main.ts`, `src/cli.ts`).

## 3. Layer contents

### domain/ — entities (OOP value models) + ports + errors

| File | Responsibility (SRP) |
|---|---|
| `app-definition.ts` | Aggregate for one app: `id`, `label`, `description`, `enabled`, `primitives`, `sources[]`, `shortcuts[]`; owns invariants (id format, unique source ids) |
| `data-source.ts` | One data source inside an app: `type`, connection fields (`repo`, `views_dir`, `stats_file`…) |
| `shortcut.ts` | Macro aggregate: name, ordered steps, reply template; owns the name-to-tool-name rule and the step limit |
| `tool-spec.ts` | Neutral description of a tool to expose: name, description, input schema, output shape (what the catalog produces) |
| `ports/config-store.ts` | `listApps() / getApp(id) / saveApp(def) / removeApp(id) / listAppFiles()` |
| `ports/data-source-reader.ts` | Per-source read verbs: `search(def, params) / read(def, key) / status(def)` |
| `ports/health-reporter.ts` | `report(source) → SourceHealth` (used by status/management) |
| `ports/tool-registrar.ts` | `register(spec, handler)` — hides MCP SDK from the core |
| `ports/logger.ts` | minimal `info/warn/error` + child scopes |
| `errors.ts` | Typed errors: `AppNotFoundError`, `ValidationError`, `SourceUnavailableError`, `ConfigError` |

### application/ — use-case services (thin, orchestrate via ports)

| Service | Responsibility |
|---|---|
| `app-registry.service.ts` | Load/list/get apps from the ConfigStore port; parse into `AppDefinition` |
| `tool-catalog.service.ts` | `AppDefinition → ToolSpec[]` — the config→tools brain (pure function over domain) |
| `search/read/status.service.ts` | Per-verb use cases: pick adapter via factory, run, shape response for speech |
| `health.service.ts` | Per-app and stack-wide health summary (drives `stack_status` and management) |
| `management.service.ts` | Add / remove / enable / disable / validate / export apps; enforces safety rules; writes via ConfigStore port |
| `response-shaper.ts` | Read model → spoken-friendly text (length caps, date phrasing, "and N more"); the Design differentiator |
| `tool-runner.service.ts` | Runs any generated tool by name. Both the MCP layer and shortcuts dispatch through it, so neither owns the mapping |
| `shortcut.service.ts` | Runs a shortcut's steps in order and stitches the answers into one |

### infrastructure/ — adapters (the "common" layer)

| Adapter | Implements | Notes |
|---|---|---|
| `yaml-config-store.ts` | ConfigStore | reads `config/apps/*.yml`; atomic write + backup on save |
| `github-repo.adapter.ts` | DataSourceReader + HealthReporter | fetches `data/views/*.json` from raw.githubusercontent + Actions/commits from api.github.com; maps to search/read/status |
| `json-url.adapter.ts` *(planned)* | DataSourceReader | generic public JSON |
| `rss.adapter.ts` *(planned)* | DataSourceReader | feed → items |
| `http-client.ts` | — | fetch wrapper: timeout, retry, shared cache, rate-limit guard |
| `ttl-cache.ts` | — | per-URL in-memory cache (default TTL 300 s) |
| `pino.logger.ts` | Logger | structured JSON logs + request ids |

### presentation/ — thin faces over application services

| Face | Files | Responsibility |
|---|---|---|
| MCP server | `mcp/server.ts`, `mcp/tool-mapper.ts` | Streamable HTTP transport; maps `ToolSpec` → MCP tool definition; errors → MCP-shaped results |
| CLI | `cli.ts`, `cli/commands/*.ts` | management operations from a terminal |
| Web design system | `web/theme.ts`, `web/layout.ts` | shared tokens, page shell and navigation; every page renders through one layout so they stay one product |
| Landing | `web/landing.ts` | the idea in ten seconds, with live numbers read from the running stack |
| Web console | `console/routes.ts`, `console/apps-page.ts`, `console/shortcuts-page.ts`, `console/settings-page.ts`, `console/signin-page.ts` | one route per concern over the same ManagementService, plus a settings write path. The server renders each page's frame; adding and editing happen in client dialogs |
| Web client | `web/client/`, compiled by `tsconfig.client.json` to `dist/public` and served at `/assets` | browser components as classes with no framework: `Modal`, `ConfirmDialog`, form controls, and per-screen forms such as `AppFormModal`. Each screen's entry file is its composition root. Forms depend on gateway interfaces such as `AppsGateway`, never on `fetch`, and a new source type is a new `LocationEditor` |
| Simulator | `simulator/routes.ts`, `simulator/page.ts` | simulated Alexa+ client; drives the server as a real MCP client |

## 4. Multi-app design (P2)

- An **app** = a named, enabled/disabled bundle: label, primitives, one or more
  data sources, optional shortcuts. Files live in `config/apps/*.yml`; filename
  must match the app `id`.
- **Registry** loads *all* files at startup into `AppDefinition[]` (fail-fast on
  validation error, with the offending file named).
- **Tool namespace:** every enabled app with `search: true` exposes
  `{id}_search(query?, topic?, limit)`; same for `read` / `status`. Global tools:
  `stack_status()`.
- **Adding an app** = drop a validated file in `config/apps/` (or run
  `stackvoice app add`) and restart. Core code untouched → OCP demonstration.
- **Per-app shortcuts** compile to `{shortcut_name}` tools with deterministic
  step order.

```
AppDefinition (aggregate)
 ├─ sources[]   → each resolved by adapter factory (type → adapter)
 ├─ primitives  → which verbs generate tools
 └─ shortcuts[] → each compiles to one deterministic tool
```

## 5. Management subsystem (P3)

One **ManagementService** (application layer) is the single source of truth.
Every face is a thin adapter over it — no duplicated logic (DIP + DRY):

```
CLI  ─────────┐
Web console ──┼──► ManagementService ──► ConfigStore port ──► config/apps/*.yml
              │         │
              │         ├──► SourceInspector port ──► GithubRepoInspector
              │         └──► HealthService / AppRegistryService (read paths)
              │
              └── both faces are thin: neither holds a validation rule,
                  a backup rule, or a write path of its own.
```

The console being cheap to add is the payoff for the port boundary: it is a
route file and a page, because every rule it needs already lived in the service.

Operations: `list`, `status`/`health`, `show config`, `logs`, `add` (from
template), `remove`, `enable/disable`, `validate`, `export`. Safety rules
(live-config guard, backup before write, confirmation for remove) live in the
service so every face inherits them. Full spec: MANAGEMENT.md.

## 6. SOLID mapping (concrete, checked per class)

| Principle | Where it shows up |
|---|---|
| **S** — Single Responsibility | One class, one reason to change: `AppDefinition` (state+invariants) ≠ `ToolCatalogService` (config→tools) ≠ `GithubRepoAdapter` (fetching) ≠ `ManagementService` (registry mutations) ≠ `ToolMapper` (MCP shape) |
| **O** — Open/Closed | New source type → new adapter + factory entry; registry/catalog/services unchanged. New verb → new use-case; catalog iterates primitives. New management face → new thin adapter over the same service |
| **L** — Liskov | Every `DataSourceReader` returns the same shapes (`search/read/status`); clients depend on the port, not on `github-repo` specifics |
| **I** — Interface Segregation | Ports are small: `ConfigStore` ≠ `DataSourceReader` ≠ `HealthReporter` ≠ `ToolRegistrar` ≠ `Logger`; no god-interface, no unused methods |
| **D** — Dependency Inversion | `domain/` declares ports; `infrastructure/` implements them; composition root injects. `application/` imports only `domain/` |

## 7. Design patterns used

- **Factory** — adapter selection by `source.type` (`github-repo` → instance);
  new types register here only.
- **Repository** — `ConfigStore` abstracts `config/apps/*.yml` (filesystem)
  behind a port; domain never touches paths.
- **Registry** — app registry loads + validates + indexes apps.
- **Strategy** — verbs (`search/read/status`) are strategies per source type.
- **Mapper** — `ToolSpec ↔ MCP tool definition` isolation (SDK stays in
  presentation).
- **Composition root** — `main.ts` / `cli.ts` wire everything; classes never
  self-instantiate dependencies (constructor injection).

## 8. Errors, logging, caching

- **Errors:** typed domain errors (`domain/errors.ts`); use cases return results
  or throw typed errors; presentation maps them (MCP error text / CLI exit code /
  HTTP status). No raw `Error` escapes to a client.
- **Logging:** structured JSON via `Logger` port; `requestId` per MCP call; app id
  and source id as log fields; never log tokens/secrets. Logs are a management
  feature (`stackvoice logs`).
- **Caching:** shared `ttl-cache` keyed by normalized URL (default 300 s) to stay
  inside unauthenticated GitHub limits (60 req/h) and keep voice latency low.

## 9. Testing strategy

| Layer | Test | Technique |
|---|---|---|
| domain | invariants, catalog pure logic | plain unit tests, no I/O |
| application | registry load, management add/remove/validate, health aggregation | fake ports (in-memory ConfigStore, fake readers) |
| infrastructure | yaml-config-store parse/write/atomic; github-repo adapter mapping | fixtures + mocked HTTP (no network) |
| presentation | MCP tool registration & error mapping | MCP Inspector + local client calls; CLI golden tests |
| end-to-end (stage 5) | boot server → Inspector/agentic client → real endpoints | optional live smoke (public JSON) |

## 10. Directory structure (planned — created in Stage 1)

```
StackVoice/
├─ config/
│  ├─ settings.yml
│  └─ apps/{app}.yml
├─ src/
│  ├─ main.ts  cli.ts            # composition roots
│  ├─ domain/  entities · ports · errors
│  ├─ application/  services
│  ├─ infrastructure/  config · adapters · http · cache · logging
│  └─ presentation/  mcp · cli (web planned)
├─ tests/  unit · integration · fixtures
├─ docs/… (top-level *.md)
└─ package.json tsconfig.json    # created in Stage 1
```
