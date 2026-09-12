# StackVoice

**Ask your own stuff — not the internet.**

StackVoice is a self-hosted **MCP server** that turns your own data projects
(GitHub pipelines, datasets, libraries, feeds) into tools an AI assistant can
call. You point it at *your* apps in config; tools are generated for those apps
automatically. The assistant understands the user's words — StackVoice gives the
assistant the hands.

- **Status:** Stage 1 — implementation started 2026-09-12.
  Implementation starts with Stage 1 (see FRAMEWORK.md §Roadmap).
- **Target:** Amazon *Build, Ship, Shape* hackathon — Alexa+ track (deadline Oct 23, 2026).
- **Stack:** Node.js 20+ / TypeScript · MCP spec 2025-11-25 · Streamable HTTP · $0 budget.

## Quick start

```bash
npm install
npm run dev              # starts the MCP server on http://127.0.0.1:8765/mcp
npx @modelcontextprotocol/inspector   # point it at that URL to list and call tools
```

`npm test` runs the unit suite. Settings live in `config/settings.yml`. Set
`auth.mode` to `token` for a shared bearer token, or to `oauth` for the full
OAuth 2.1 + PKCE flow that Alexa+ requires — see CONFIGURATION.md §2.

## What's inside (scope — decided before any code)

1. **Config-driven MCP core** — one server, tools generated from config at startup.
2. **Multi-app registry from day one** — add as many apps/projects as you want
   (`config/apps/*.yml`); every app gets its own tool namespace.
3. **Management system from day one** — manage apps and monitor health through
   one service with three faces: CLI, (optional) local web console, optional
   admin MCP tools.
4. **Standards-compliant engineering** — OOP + SOLID + Clean/Hexagonal
   architecture (see CODING_STANDARDS.md and ARCHITECTURE.md).

## Docs map

| Doc | Covers |
|---|---|
| [FRAMEWORK.md](./FRAMEWORK.md) | Product concept, verified hackathon constraints, judging map, roadmap, risks |
| [RESEARCH.md](./RESEARCH.md) | Landscape research — who is building what in private-data × MCP × voice |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture — layers, ports & adapters, multi-app design, management subsystem, SOLID mapping |
| [CONFIGURATION.md](./CONFIGURATION.md) | User config schema — `settings.yml` + `config/apps/*.yml`, validation rules, worked examples |
| [MANAGEMENT.md](./MANAGEMENT.md) | Management system — features, CLI / web / admin faces, safety model |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Engineering standards — OOP/SOLID/Clean, TypeScript, error handling, testing, git |
| [FRICTION_LOG.md](./FRICTION_LOG.md) | Development friction log (Amazon gives up to +10% judging bonus) |

## Demo persona

Two real, live apps ship as the default config (replace with your own by adding
a file):

- **`library`** — the [information-hub](https://satpaingoo.github.io/information-hub/web/)
  deep-dive intelligence library (125+ verified items, growing daily).
- **`markets`** — the [eventpulse](https://satpaingoo.github.io/eventpulse/)
  event → market intelligence system (same-day deploys).

Both are real pipelines with live public JSON — the demo is not mocked.

## License & open-source

Planned: MIT. Public repo from day one (also qualifies for the hackathon's
Open Source mini challenge).
