# Try StackVoice

A tour of everything StackVoice does, on your own machine, in about fifteen
minutes; the first two steps take five. It runs locally: there is no hosted
copy, and nothing needs an account.

The Alexa+ part is simulated. The Alexa+ MCP Toolkit is a preview open to
select partners only, so the page at `/simulator` stands in for an Alexa+
device: it is a real MCP client calling this server over Streamable HTTP. Step 6
connects an AI assistant you may already have instead.

The demo video shows all of it in under three minutes: [https://youtu.be/che6nlzd_SA](https://youtu.be/che6nlzd_SA).

## Run it

You need Node.js 22 (22.12 or later) or 24, Git, and an internet connection: the two demo apps
read public data from GitHub. For voice, use Chrome or Edge; typing works in any
browser.

```bash
git clone https://github.com/SatPaingOo/stackvoice.git
cd stackvoice
npm ci
npm run dev
```

Wait for the log line `stackvoice listening`. The server is at
http://127.0.0.1:8765 and asks for no sign-in, because it listens on localhost
only.

## 1. Ask it something

Open http://127.0.0.1:8765/simulator and type, or tap the microphone and say:

| Say | What runs |
|---|---|
| Is my stack healthy? | `stack_status` |
| What did you find about AI in my library? | `library_search` with the query `ai` |
| Tell me more | `library_read` for the first result |
| News about AI | The shortcut `news_about_topic`, with `topic` filled from what you said |

Under each answer is the tool call that produced it, with its arguments and how
long it took. This page is a simulated Alexa+ client: it calls the server's own
`/mcp` endpoint over Streamable HTTP, as a device would. For a hands-free
conversation, tap **Start a conversation**, and say "stop" to end it.

## 2. Add a source of your own

1. Open http://127.0.0.1:8765/console and click **Add an app**.
2. Click the **News feed** example, or paste any RSS feed, JSON API or CSV link.
3. Click **Look at it**. Every guessed field shows a sample from the data.
4. Optional: click a field, then click a column to change it.
5. Click **Save app**. The card shows the new tools.
6. In the simulator, ask "Is my BBC News app healthy?", or ask about a word you
   can see in one of its headlines.

## 3. Build a voice shortcut

1. Open http://127.0.0.1:8765/console/shortcuts and click **Add a shortcut**.
2. Name it `quick news`, and write the phrase `quick news about {topic}`.
3. Click **Ask**. It starts on `library_search`, searching for `{topic}`, saved as
   `answer`.
4. Click **If**. It starts as "how many entries `answer` has is exactly 0". Under
   **Then**, add **Say** with `Nothing about {topic} yet.`, and add **Stop**.
5. Under the If, add **Say** with
   `{answer.count} results. The first is {answer.first.title}.` The **Insert**
   menu beside the field offers these names.
6. In **Try it**, type `AI` for `{topic}` and click **Try it**. The answer and every
   block that ran appear.
7. Click **Save shortcut**, then say "quick news about AI" in the simulator.

## 4. Check it as an MCP server

```bash
npx @modelcontextprotocol/inspector
```

Choose the Streamable HTTP transport, connect to http://127.0.0.1:8765/mcp, and
list the tools. `news_about_topic` has a required `topic` input.

## 5. Optional: OAuth 2.1

Stop the server, and in `config/settings.yml` set `auth.mode: oauth`, a
`token` of your choice, and `public_url: "http://127.0.0.1:8765"`. Start it again.

```bash
curl http://127.0.0.1:8765/.well-known/oauth-authorization-server
curl -i http://127.0.0.1:8765/mcp
```

The first lists `S256` as the PKCE method. The second returns `401` with a
`WWW-Authenticate` header. The simulator stands down in this mode by design,
because an authorization code flow needs a person at a browser.

## 6. Optional: an AI assistant you already have

Any MCP client works. With Claude Code:

```bash
claude mcp add --transport http stackvoice http://127.0.0.1:8765/mcp
```

Ask it "news about AI": it runs the `news_about_topic` shortcut with `topic`
filled. With the server in `oauth` mode from step 5, run `/mcp` in Claude Code
and choose Authenticate first: it registers itself, and the consent page in the
browser asks for the owner token. A restart of StackVoice does not sign it out:
the registration and the refresh token are kept in `config/oauth.json`.

## Worth knowing

- Use `127.0.0.1` rather than `localhost`. The server listens on IPv4 only, and
  Node.js-based clients such as the MCP Inspector may resolve `localhost` to the
  IPv6 address first and fail to connect.
- StackVoice has not run on a real Alexa+ device; the Alexa+ MCP Toolkit is a
  preview open to select partners only. The simulator is the demonstration.
- Voice uses the browser's own speech service, which may send audio to Google in
  Chrome or Microsoft in Edge.
- The demo apps call GitHub without a key. GitHub allows 60 such requests an
  hour, and answers are cached for five minutes, so a long session may briefly
  show a source as unavailable.
- `npm test` runs the unit tests with no network. `npm run test:e2e` runs the
  browser tests and needs Microsoft Edge installed.
