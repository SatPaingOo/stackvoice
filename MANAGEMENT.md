# StackVoice — Management System

The management system is a **day-one pillar**, not an afterthought: the same
product that exposes apps to an assistant also lets the owner manage those apps
and monitor their health. One service, three faces — no duplicated logic.

Companion: ARCHITECTURE.md §5 (subsystem design), CONFIGURATION.md (schemas).

---

## 1. Goals & personas

**Goals**
- Add / remove / enable / disable apps without touching code or YAML by hand.
- See the health of every app and its sources at a glance (the same data the
  assistant's `stack_status` returns).
- Validate config before it goes live; never corrupt a live config.
- Everything works offline/local-first; no accounts, no cloud dependency.

**Personas**
- **Owner (primary):** the self-hoster running their own stack — wants a fast
  terminal + a glanceable status.
- **Demo audience / judges:** see "add an app → new tools appear" as the product
  story; see management as proof it's a product, not a script.

## 2. Feature list

### Discover
| Command / tool | What it returns |
|---|---|
| `stackvoice apps list` | id, label, enabled, source count, shortcut count |
| `stackvoice status` | per-app + stack health summary (JSON/table) |
| `stackvoice app show <id>` | full effective config of one app |
| `stackvoice logs [--app <id>] [--tail N]` | recent structured logs |

### Change
| Command | Behavior |
|---|---|
| `stackvoice app add <id> --repo <owner/name>` | inspect the repo → infer the field map → validate → write |
| `stackvoice app remove <id> [--yes]` | requires confirmation; writes a backup first |
| `stackvoice app enable <id>` / `disable <id>` | flip `enabled`; the watcher picks it up |
| `stackvoice app validate [<id>]` | run full validation without writing |

`app add` is the command the product turns on. Config-driven only means anything
if configuring is easy, and the hard part was never the YAML — it was working out
which key in your own JSON holds the title. The inspector does that and shows its
working, so adding an app is one command and a glance rather than an afternoon.

### Safety rules (enforced in the service — every face inherits them)
1. **No blind writes:** every mutation validates first; invalid config is never
   written.
2. **Backup before write:** on each mutation the previous file is preserved
   (`config/backups/<id>.yml.<timestamp>`).
3. **Confirmation for destructive ops:** `remove` requires `--yes` (CLI) or an
   explicit confirm (web/admin).
4. **Fail-fast on load:** a broken app file fails startup with the file named —
   management `validate` exists precisely so this happens before restart.
5. **Never rewrite user comments/format:** ConfigStore writes canonical YAML from
   the parsed model; hand-authored files are treated as inputs, backups keep the
   original.

## 3. Health payload (shared by `stack_status`, `{id}_status`, management `status`)

```json
{
  "appId": "library",
  "enabled": true,
  "ok": true,
  "checkedAt": "2026-09-05T05:40:00Z",
  "sources": [
    {
      "sourceId": "library",
      "ok": true,
      "lastRunAt": "2026-09-05T05:36:39Z",
      "lastRunConclusion": "success",
      "lastDataDate": "2026-09-05",
      "itemCount": 125,
      "latencyMs": 340,
      "lastError": null
    }
  ]
}
```

One **HealthService** produces this; the assistant tool and the management faces
render the same object (spoken summary vs table vs JSON).

## 4. The three faces

### A. CLI (primary)
`stackvoice <command>` — thin adapter over ManagementService/HealthService. Every
safety rule lives in the service, so a second face cannot forget one.

```
$ stackvoice apps list
  ID        LABEL              ENABLED  SOURCES  SHORTCUTS
  library   Deep-dive library  yes      1        1
  markets   Market intelligence yes     1        0

$ stackvoice app add --from-template library --id mynews
  ✓ validated  mynews
  ✓ written    config/apps/mynews.yml   (backup: none — new file)
  → restart server to expose tools: mynews_search, mynews_read, mynews_status

$ stackvoice status
  ✓ library  — last run 2 min ago (success), 125 items, data fresh to today
  ✓ markets  — deployed 6 h ago (success)
  stack: healthy
```

### B. Admin MCP tools (opt-in, gated)
Enabled only when `settings.management.admin_mcp_tools: true` — lets the *same*
assistant manage the stack by voice ("add my new repo as an app"). Tools:

| Tool | Effect |
|---|---|
| `admin_list_apps()` | read-only listing |
| `admin_app_status(id)` | health of one app |
| `admin_add_app(app_yaml)` | validate + add (requires full app YAML from the user/config) |
| `admin_set_app_enabled(id, enabled)` | enable/disable |
| `admin_validate(id?)` | validate one or all apps |
| `admin_remove_app(id)` | disabled by default; requires `confirm: true` arg |

Design note: admin tools default **off** and are read-mostly — a voice agent
mutating config is a deliberate, documented, opt-in choice (safe demo: enable it
only in the demo persona).

### C. Web console (optional, stage 5)
Local read-only dashboard (list + health + logs) and an "add app" form calling
the same services. Not required for the hackathon deliverable; adds demo polish
if time allows.

## 5. Security model

- Default bind: `127.0.0.1` (localhost only), with `auth.mode: none`.
- Exposed publicly: set `auth.mode` to `token` (one shared bearer token) or
  `oauth` (OAuth 2.1 with PKCE, which Alexa+ requires). Both are enforced on
  every request to `/mcp`; `/healthz` stays open as a liveness probe.
- In `oauth` mode the consent screen asks for `auth.token`, because a
  self-hosted server has one user and no identity provider. Tokens are held in
  memory, so a restart signs every client out.
- Admin MCP tools are cut from scope (FRAMEWORK.md §7), so no tool can mutate
  config.
- Logs never include tokens, file contents, or full query payloads.

## 6. Staged rollout

| Stage | Window | Delivers |
|---|---|---|
| Stage 3 (core) | Sep 19–26 | ManagementService + ConfigStore write path + CLI: list/status/show/add/remove/enable/disable/validate/logs + tests |
| Stage 4 | Sep 27–Oct 4 | admin MCP tools (gated) + `app export` |
| Stage 5 | Oct 5–11 | web console (if time) + auth hardening |
