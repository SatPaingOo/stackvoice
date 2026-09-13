# StackVoice — Coding Standards

Engineering standards for the StackVoice codebase: **OOP + SOLID + Clean
Architecture** in strict TypeScript on Node.js 20+. Every rule below exists to
keep the core (domain + application) pure, testable, and open for new apps and
source types without rewriting.

Companion: ARCHITECTURE.md (structure), CONFIGURATION.md (schemas).

---

## 1. Guiding principles

1. **The core is pure.** `domain/` and `application/` import nothing from the
   outside world (no MCP SDK, no `fs`, no `fetch`, no YAML, no zod). Everything
   external arrives through a port.
2. **Config is the product, code is the platform.** Prefer adding a config field
   over adding a branch.
3. **Readable over clever.** Write for the next reader (who is you, in 6 weeks).
4. **OOP where it models the domain, functions where it computes.** Entities and
   services are classes with responsibilities; pure computations (catalog
   mapping, response shaping) are plain functions unless they hold state.
5. **YAGNI + KISS.** Build the stages in FRAMEWORK.md §7; do not pre-build source
   types or faces nobody has asked for yet.

## 2. OOP in this project

- **Classes = state + behavior that belongs together, with one responsibility.**
  `AppDefinition` owns its invariants (id format, unique ids) — a plain object
  can't, which is why we model it as a class/aggregate.
- **Value objects for constrained fields:** `AppId`, `SourceType` — validated at
  construction; invalid values cannot exist.
- **Services are classes with constructor injection.** No `new` inside a service
  for a collaborator it should receive; no service locators.
- **No anemic domain:** if a method expresses domain logic, put it on the entity
  (`app.requiresSource(id)`, `app.enabledVerbs()`), not in a service.

## 3. SOLID checklist (concrete for this codebase)

| Rule | Check |
|---|---|
| **S** | Each class/file has one reason to change. `AppDefinition` ≠ `ToolCatalogService` ≠ `GithubRepoAdapter` ≠ `ManagementService` ≠ `ToolMapper`. If you can't name the single responsibility, split it. |
| **O** | New source type → new adapter implementing `DataSourceReader` + one factory entry. New management face → new thin adapter. **No existing class modified.** |
| **L** | Any `DataSourceReader` is substitutable: same return shapes, same error semantics. Adapters must not leak their transport quirks (GitHub pagination, YAML details) to callers. |
| **I** | Ports stay small. Never grow a port with a method only one implementation needs. Split before you need to. |
| **D** | Dependencies point inward: `domain/` defines ports, `infrastructure/` implements them, composition root (`main.ts`/`cli.ts`) wires. `application/` imports only `domain/`. |

Enforcement: `npm run lint` fails on an import from `infrastructure/`,
`presentation/`, an SDK, a boundary library or a Node.js built-in inside
`domain/` or `application/`.

## 4. Clean Architecture dependency rule

```
presentation → application → domain  ← infrastructure (implements domain ports)
```

- **Never** import across a layer boundary other than outward-to-inward.
- Ports live in `domain/ports/` as TypeScript interfaces (no zod, no classes
  with I/O).
- Adapters live in `infrastructure/` and implement exactly one port (+ small
  helpers).

## 5. TypeScript conventions

- **Strict mode on.** No `any` (escape hatch: documented `unknown` + narrow).
- **zod at the boundaries only:** config files (YAML→typed), tool inputs, API
  responses. Inside domain/application, types are plain interfaces/classes.
- **`interface` for ports and public shapes; `type` for unions.**
- **Immutability by convention:** prefer `readonly` arrays/fields; treat parsed
  config as immutable once loaded; mutations go through services that write fresh
  state.
- **No unused imports/variables.** Enforced by `noUnusedLocals` and
  `noUnusedParameters` in both tsconfig files, and by ESLint's
  `no-unused-vars` as an error.
- **Lint and format:** `npm run lint` (ESLint flat config, typed rules for
  `src/`, including `no-floating-promises`) and `npm run format` (Prettier,
  120 columns, single quotes, trailing commas). Markdown and `config/` are
  laid out by hand and left out of formatting.
- Async everywhere it touches I/O; no sync `fs` reads in request paths.
- Use `node:` prefix for builtins (`node:fs`, `node:path`).

## 6. Naming

| Thing | Convention | Example |
|---|---|---|
| Files (class per file) | `kebab-case.ts` | `app-definition.ts`, `github-repo.adapter.ts` |
| Classes / entities | PascalCase | `AppDefinition`, `ManagementService` |
| Functions / methods | camelCase, verb-first | `listApps()`, `generateToolSpecs()` |
| Ports | noun role, no `I` prefix | `ConfigStore`, `DataSourceReader`, `Logger` |
| Adapters | `<thing>.<role>.ts` | `yaml-config-store.ts`, `github-repo.adapter.ts` |
| Test files | `*.test.ts` beside or in `tests/` mirroring `src/` | `tests/unit/application/management.service.test.ts` |
| Config ids (apps/sources) | lowercase + dashes | `library`, `markets`, `my-news` |

## 7. Error handling

- Typed domain errors in `domain/errors.ts` (`AppNotFoundError`,
  `ValidationError`, `SourceUnavailableError`, `ConfigError`).
- Use cases either return a result or throw a *typed* error — never a bare
  `Error` or `throw "string"`.
- Presentation maps errors once: MCP tool result (message text), CLI exit codes,
  HTTP status. No error shape leaks between layers.
- Wrap external failures (fetch timeout, GitHub 5xx, malformed JSON) into typed
  errors at the adapter boundary; the adapter never throws raw SDK errors.

## 8. Logging

- Through the `Logger` port only (implementation: pino, structured JSON).
- Include context fields: `appId`, `sourceId`, `requestId`, `tool`.
- Levels: `debug` (payloads), `info` (lifecycle: config loaded, tool registered,
  management mutation), `warn` (recoverable source errors), `error` (unhandled).
- **Never log:** auth tokens, secrets, full user queries. Log tool *names* and
  arg *keys*, not values.

## 9. Config handling

- All YAML passes zod schema validation (schemas in
  `infrastructure/config/*.schema.ts`) — single source of truth for shapes.
- Fail fast at startup on invalid config; name the file and field.
- Management writes go through `ConfigStore` (atomic write + timestamped backup);
  never write files directly from presentation.

## 10. Testing standards

- **Unit** (domain + application): pure, fast, no network/fs; fake ports
  (in-memory `ConfigStore`, fake readers).
- **Integration** (infrastructure): fixtures + mocked HTTP (no live network in
  CI); test yaml parse/write, adapter mapping, cache behavior.
- **Presentation:** tool registration + error mapping; CLI golden outputs.
- Naming: `describe(unit under test)` → `it(behavior)`, e.g.
  `describe('ManagementService.removeApp')` → `it('backs up and refuses without
  confirmation')`.
- Cover the judgment calls, not just happy paths: validation failures, unknown
  app ids, source errors, cache hits/misses, disabled apps generate no tools.

## 11. Git & PR workflow

- **Branches:** one author, so commits go straight to `main`. Use
  `feat/<slug>`, `fix/<slug>` or `docs/<slug>` once anyone else contributes.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`); small, single-purpose commits.
- **PR checklist:** builds clean · `npm test` green · lint/format clean · no
  cross-layer imports (standards §3) · no secrets · tests for new behavior ·
  docs touched if behavior changed.
- **License:** MIT at root. The repository is private until submission and
  public from then on, as the rules and the Open Source mini challenge require.
- **No AI contributors:** no `Co-Authored-By` trailer naming an AI tool, and
  AI tool working folders stay git-ignored.

## 12. Definition of Done

1. Implements the acceptance criteria for its stage (FRAMEWORK.md §7).
2. Tests written + green for the new behavior.
3. No SOLID/layer violations (checked in review).
4. Config/docs updated if user-facing shape changed.
5. Friction log entry added if you hit anything Amazon could improve
   (FRICTION_LOG.md — worth +10% bonus).

## 13. Anti-patterns to avoid

- God classes / god files (a `server.ts` that also parses config and fetches).
- Config or magic strings buried in services (id formats, URLs, file paths).
- Adapter leaks: GitHub-specific fields appearing in domain models.
- Premature abstraction: the second source type is when we generalize the
  adapter factory — not the first.
- `any`, `@ts-ignore`, sync I/O in request paths, secrets in code or logs.

---

Last reviewed: 2026-09-13
