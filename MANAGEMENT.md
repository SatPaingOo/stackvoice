# StackVoice — Management System

The same product that exposes apps to an assistant lets their owner add, correct
and watch over those apps. One service, two faces: a **web console** for anyone
and a **CLI** for developers. Neither holds a rule of its own.

Companion: ARCHITECTURE.md §5 (subsystem design), CONFIGURATION.md (schemas).

---

## 1. Goals & personas

**Goals**
- Add, correct, enable, disable and remove apps without touching code or YAML.
- See the health and freshness of every app at a glance, from the same data the
  assistant's `stack_status` tool returns.
- Validate config before it goes live, and never corrupt a live config.
- Work offline and local-first: no account, no cloud dependency.

**Personas**
- **Owner:** the person running the server. Has a feed, a sheet, an API or a data
  project, and may never open a terminal.
- **Developer:** wants a fast CLI and files that are readable by hand.
- **Judges and demo audiences:** see "paste a source, and new tools appear" as the
  product story.

## 2. Features

### Web console

Served at `/console` when `console.enabled` is true.

| Page | What it does |
|---|---|
| Apps | Add an app in a dialog from any source, see every inferred field with a sample from the data, and correct a field by clicking a column. Edit, enable, disable or remove an app. Each card shows the source kind, health, freshness and the tools the app gives the assistant |
| Shortcuts | Build a shortcut from blocks: phrases with slots, Ask, If and Otherwise, Say, Get, Set, Stop. **Try it** runs the draft with sample slot values and shows every block that ran |
| Settings | Access mode and owner token, the public address, data sources, which pages are served, server options, and **saved keys** by name |
| Sign-in | Asks for the owner token when the server is exposed beyond localhost |

A save reloads the registry at once, so new tools are live in the next
conversation without a restart. Closing a dialog with unsaved changes asks first,
and every removal asks in the console's own confirm dialog.

### CLI

```bash
npm run stackvoice -- <command>
```

| Command | What it does |
|---|---|
| `apps` | Every configured app: id, label, whether it is enabled, and its tools |
| `status` | Health of every app, and of the stack as a whole |
| `shortcuts` | Every shortcut, its tool name, and the tools its flow asks |
| `app show <id>` | The effective config of one app |
| `app validate [<id>]` | Run full validation without starting the server or writing anything |
| `app add <id> --from <source>` | Inspect a link, repository or file, print the guesses with samples, validate, write |
| `app enable <id>` / `app disable <id>` | Flip `enabled`; the watcher picks it up |
| `app remove <id> --yes` | Delete the app file, keeping a backup |

`app add` also takes `--header "Name: value"` for a key reference such as
`Authorization: Bearer {{secret:MY_KEY}}`, `--branch` for a GitHub repository,
and `--label` and `--description`.

Adding an app is the command the product turns on. Config-driven only means
anything if configuring is easy, and the hard part was never the YAML: it was
working out which key in someone's own data holds the title. The inspector does
that and shows its working.

## 3. Safety rules

Enforced in `ManagementService` and the stores, so every face inherits them.

1. **No blind writes.** Every change validates first; invalid config is never
   written.
2. **Backup before write.** The previous file is kept in `config/backups/`.
3. **Confirmation for destructive changes.** `--yes` on the CLI, a confirm dialog
   in the console.
4. **Fail fast on load.** A broken app file stops startup and names the file and
   field. `app validate` exists so that happens before a restart.
5. **Canonical writes.** A written file is regenerated from the parsed model, so
   hand-written comments are not kept; the backup keeps the original.
6. **Keys go in, never out.** A saved key is never sent back to a browser, and
   neither is any header value. An app moved to a different site does not carry
   its key along.
7. **Reads stay contained.** Links cannot reach private or cloud metadata
   addresses unless settings allow it, and file sources cannot leave the data
   folder, which may not overlap `config/`.

## 4. Health payload

One `HealthService` produces this object. `stack_status` speaks it, `status`
prints it as a table, and the console shows it on each card. Values below are
illustrative.

```json
{
  "ok": true,
  "checkedAt": "2026-09-13T05:40:00.000Z",
  "version": "0.3.0",
  "uptimeSeconds": 3600,
  "apps": [
    {
      "appId": "library",
      "enabled": true,
      "ok": true,
      "sources": [
        {
          "sourceId": "library",
          "ok": true,
          "lastRunAt": "2026-09-13T05:36:39Z",
          "lastDataDate": "2026-09-13",
          "itemCount": 177,
          "latencyMs": 42,
          "lastError": null
        }
      ]
    }
  ]
}
```

`lastRunAt` comes from GitHub Actions and is null for links and files, whose
freshness is the newest date among their records.

## 5. Security model

- Default bind is `127.0.0.1` with `auth.mode: none`.
- Exposed beyond localhost, set `auth.mode` to `token` (one shared bearer token)
  or `oauth` (OAuth 2.1 with PKCE, which Alexa+ requires). Either is enforced on
  every request to `/mcp`; `/healthz` stays open as a liveness probe.
- In `token` or `oauth` mode the console asks for the owner token and keeps a
  session cookie for twelve hours. The cookie is `HttpOnly`, `SameSite=Strict`,
  and `Secure` whenever the page was reached over HTTPS.
- Ten wrong owner tokens from one address lock that address out of the console
  sign-in, `/mcp` and the consent screen for up to 15 minutes, even for the
  right token. Behind a host's proxy, set `server.trusted_proxies` so each
  visitor is counted on their own (CONFIGURATION.md §2).
- Owner tokens are compared in constant time, over hashes of equal length.
- In `oauth` mode the consent screen asks for the owner token, because a
  self-hosted server has one user and no identity provider. Tokens are held in
  memory, so a restart signs every client out.
- Keys live in `config/secrets.yml`, written readable by its owner only, or in
  `STACKVOICE_SECRET_*` environment variables. App files hold references only.
- Logs never include tokens, key values, file contents or the values a tool was
  called with. At debug level each fetched URL is logged in full, so a key belongs
  in a header, never in a URL's query string.

## 6. Designed but not built

| Feature | State on 2026-09-13 |
|---|---|
| Admin MCP tools, which would let the assistant change config by voice | Cut on 2026-09-12 when scope was set to core and simulator (FRAMEWORK.md §7). No tool can change config |
| `stackvoice logs` | Not built. The server writes structured JSON logs to standard output |
| Adding an app from a template, and `app export` | Not built. Apps are added by inspecting a source, and app files are already plain YAML |

---

Last reviewed: 2026-09-13
