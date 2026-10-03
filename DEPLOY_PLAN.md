# StackVoice — Deploy plan (hosted demo for judges)

A public HTTPS copy of StackVoice that judges can use from submission until the
judging period ends on 2026-11-20, at $0. The rules require free testing access
until then, with credentials if anything is private.

---

## 1. Host: a Render free web service

| Option | Decision on 2026-10-04 |
|---|---|
| **Render free web service** | **Chosen.** Native Node.js, HTTPS on an `onrender.com` address, and several free-tier guides say no credit card is needed. Render's own free-tier page does not say either way, so confirm at sign-up |
| Tunnel from a personal computer | Rejected: the computer would have to stay on until 2026-11-20 |
| Hugging Face Spaces | Rejected: a search on 2026-10-04 says a Docker Space needs a paid plan; not checked further |
| Oracle or Google Cloud free VMs | Rejected: both ask for a card at sign-up |

**Limits that matter**, from Render's documentation on 2026-10-04:

- A free service spins down after 15 minutes with no inbound traffic and takes
  about a minute to wake. The first judge after a quiet spell waits for it.
- Each workspace gets 750 free instance hours a month. One service running all
  of October uses 744, so this must be the only free service in the workspace.
- The filesystem is ephemeral. Apps, shortcuts and keys added through the
  console are lost at every restart, redeploy or spin-down, and the shipped
  demo apps come back.
- Render may suspend a free service that sends an uncommonly high volume of
  traffic.

## 2. Steps

1. Make an owner token and keep it out of the repository:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
   ```

2. Sign in to render.com with GitHub, and give Render access to the
   `stackvoice` repository. It stays private until submission.
3. Create a **Web Service** from the repository, branch `main`:

   | Setting | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm ci && npm run build` |
   | Start command | `cp /etc/secrets/settings.yml config/settings.yml && node dist/main.js` |
   | Instance type | Free |
   | Health check path | `/healthz` |

4. Add the environment variable `NODE_VERSION` with the value `24`. Render reads
   it before the `engines` field, and Node.js 24 passed the full unit suite on
   2026-10-04.
5. Add a **secret file** named `settings.yml`, with the service's own address and
   the token from step 1:

   ```yaml
   server:
     host: 0.0.0.0
     port: 10000
     log_level: info

   auth:
     mode: token
     token: "<the token from step 1>"
     public_url: "https://<service-name>.onrender.com"

   console:
     enabled: true

   simulator:
     enabled: true

   sources:
     allow_private_network: false
     data_dir: "data"

   management:
     cli: true

   cache:
     ttl_seconds: 300
   ```

   Port 10000 is Render's default for web services. The start command copies
   this file over `config/settings.yml`, so the Settings page can still save
   until the next restart.

6. Deploy, then run the checks in §4.
7. Optional: point a free uptime monitor at `/healthz` every 10 minutes from
   submission to 2026-11-20, so judges rarely meet a sleeping server. That keeps
   one service running for the whole month, which fits in 750 hours.

**Why `token` mode, not `oauth`.** The simulator stands down in `oauth` mode
because an authorization code flow needs a person at a browser. Judges need the
simulator, so the hosted copy uses one shared token.

## 3. What the hosted copy exposes

- `/`, `/simulator` and the simulator's API are open to anyone with the link.
  The simulator calls the server's own `/mcp` with the token, so it offers the
  read-only tools over every configured app. **Never add a private source to the
  hosted copy.**
- `/console` and its API ask for the token, and `/mcp` needs it as a bearer token.
- Private network access stays off, so a pasted link cannot reach Render's
  internal network.
- The console's session cookie is not marked `Secure`; Render serves HTTPS, but
  this is recorded as a known issue in ARCHITECTURE.md §12.

## 4. Checks after each deploy

```bash
curl https://<service-name>.onrender.com/healthz
curl -i https://<service-name>.onrender.com/mcp
```

The first answers `{"ok":true,...}`. The second answers `401`. Then open
`/simulator` and ask "Is my stack healthy?", and open `/console` and sign in with
the token.

## 5. Testing instructions for the form

Put this at the top of the testing instructions in
docs/devpost-submission.md once the service is live:

```text
Hosted demo: https://<service-name>.onrender.com
Simulator: /simulator, no sign-in.
Console: /console, sign in with the token <token>.
MCP endpoint: /mcp, with the header "Authorization: Bearer <token>".
The server sleeps after 15 minutes without visitors; the first page can take
about a minute to load.
```

---

Last reviewed: 2026-10-04
