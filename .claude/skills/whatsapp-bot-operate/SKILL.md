---
name: whatsapp-bot-operate
description: >
  Day-2 operations for a deployed cury-mcp WhatsApp bot. Live-edit the
  system prompt, inspect conversation threads, add docs to the corpus, send
  proactive messages, switch LLM models, and troubleshoot — all without
  redeploying the worker. Use when the user says "edit the bot's voice", "see
  what people are saying", "add docs to the bot", "send a manual message",
  "switch the model", "how's the bot doing", or otherwise wants to operate a
  WhatsApp bot they already have running.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__conductor__AskUserQuestion
---

# WhatsApp Bot Operate — Claude Code Skill

> Companion to `whatsapp-bot-fork`. That skill deploys the bot; this one runs it.

## What this skill does

Helps the user operate an already-deployed cury-mcp-style WhatsApp bot. Most operations don't require a redeploy — the worker reads config and prompt live from KV.

This skill works in two modes:

1. **MCP mode** — if the bot is registered with deco studio, call the MCP tools (`set_system_prompt`, `list_threads`, `send_text`, etc.) directly through whatever MCP client is available.
2. **Wrangler mode** — operate the bot's KV/R2 from the bot's source repo using the `wrangler` CLI. Use when MCP isn't wired in studio or when iterating fast locally.

## When to use it

Triggers:
- "edit the bot's voice" / "change the persona" / "make the bot more X"
- "see what people are asking the bot"
- "look at thread <phone>"
- "add this doc to the bot's knowledge"
- "send a WhatsApp message from the bot to <phone>"
- "switch the bot to claude / gpt / cheaper model"
- "the bot is doing X wrong — debug it"
- "what's the bot's status / cost / usage"

Don't use it for:
- Initial deploy (use `whatsapp-bot-fork`)
- Code changes to the pipeline itself (just edit `api/` files and `bun run deploy`)
- Cross-bot operations (this skill assumes one bot at a time)

---

## Required context to start

Ask once at the top, persist for the session:

1. **Bot worker URL** — e.g. `https://cury-mcp.<sub>.workers.dev`
2. **Repo path** — local checkout of the bot's source (only needed if running wrangler commands)

You can confirm both with:

```bash
curl -s <worker-url>/                                 # health
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' # MCP discovery
```

## Operations

### 1. Get bot status

**MCP:**
```bash
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status"}}'
```

Returns model, RAG status, gateway config, and which secrets are present (boolean — never exposes values).

**Wrangler:**
```bash
curl -s <worker-url>/                       # short version
bunx wrangler tail                          # live request stream
bunx wrangler ai-search get <instance>      # AutoRAG status
```

### 2. Edit the system prompt live

**Get current prompt** (MCP):
```bash
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_system_prompt"}}'
```

Returns either `source: "kv-override"` (live edit in place) or `source: "bundled-fallback"` (using the prompt baked into the worker).

**Set a new prompt:**

Best practice: have the user write or edit the full prompt in their editor, then submit via:

MCP:
```bash
PROMPT=$(cat new-prompt.md)
jq -n --arg p "$PROMPT" '{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"set_system_prompt",arguments:{prompt:$p}}}' | \
  curl -sX POST <worker-url>/mcp -H 'content-type: application/json' -d @-
```

Wrangler:
```bash
cd <repo>
wrangler kv key put --binding=CONFIG --remote system-prompt --path new-prompt.md
```

**Revert to bundled** (the prompt shipped in `prompts/*.md`):

MCP:
```bash
# Pass empty string to clear the override
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"set_system_prompt","arguments":{"prompt":""}}}'
```

Wrangler:
```bash
wrangler kv key delete --binding=CONFIG --remote system-prompt
```

Changes take effect on the **next inbound message**. There's no need to redeploy.

### 3. Inspect conversation threads

**List all today's threads:**
```bash
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_threads","arguments":{"limit":50}}}'
```

Returns `<phone>:<date>` keys. Each is one user's conversation for that UTC day.

**Read a specific thread:**
```bash
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_thread","arguments":{"from":"5521988447814"}}}'
```

Returns turns with role, content, model, token usage, cost, and citations used. Use this when:
- Debugging a complaint ("the bot said X to me")
- Tuning the prompt (read 3-4 recent threads, find a pattern, adjust)
- Auditing what the bot is talking about

**Alternative: HTTP shortcut** (no MCP needed):
```bash
curl -s '<worker-url>/test/thread?from=<phone>'
```

### 4. Send a proactive WhatsApp message

```bash
curl -sX POST <worker-url>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_text","arguments":{"to":"5521988447814","text":"Olá, é o bot. Tenho uma novidade…"}}}'
```

Notes:
- Phone must be in digits-only international format.
- Must have a recent (24h) conversation OR be a WhatsApp Template message. Outside that window, Meta blocks free-form text. Use template messages for cold outreach (manual API call for now; `send_template` is in the Meta client at `api/services/meta.ts`).
- The message you push **does not** go through the LLM — it's literally what you wrote.
- This **does not** add a turn to the thread automatically (it's an out-of-band push).

### 5. Add documents to the knowledge corpus

Only via the bot's source repo:

```bash
cd <repo>
cp ~/new-source.md corpus/NN.\ source.md      # use leading number for sort order
bun run upload-corpus --remote                # pushes to R2
```

Then in the Cloudflare dashboard:
- AI → AutoRAG → your instance → **Sync**

Indexing takes a few minutes. Confirm with:
```bash
bunx wrangler ai-search get <instance>
# status: "completed" when ready
```

Test that the new doc is retrievable:
```bash
curl -sX POST <worker-url>/test \
  -H 'content-type: application/json' \
  -d '{"from":"9999999999","text":"<a question only answered in the new doc>"}' | jq '.citations'
```

You should see the new file's title in the citations.

### 6. Switch LLM model

Models are non-secret config in `wrangler.toml`. Requires a redeploy.

```bash
cd <repo>
# Edit wrangler.toml — change LLM_MODEL line. Examples:
#   deepseek/deepseek-v4-flash               cheap, fast (default)
#   anthropic/claude-sonnet-4-6              high quality, ~25× more expensive
#   anthropic/claude-opus-4-7                top-tier reasoning, ~80× more expensive
#   openai/gpt-4o-mini                       middle-ground OpenAI option
bun run deploy
```

Validate with `/test`:
```bash
curl -sX POST <worker-url>/test \
  -d '{"from":"9999999999","text":"<test question>"}' \
  -H 'content-type: application/json' | jq '.model, .usage.cost'
```

Cost per turn changes immediately. Watch `cf-aig-metadata` in the AI Gateway dashboard for fleet-wide cost over a day before declaring victory.

### 7. Debug a misbehaving bot

Reproducible reports ("the bot said X to my friend"): use `get_thread` to read the exact exchange. Look at:

- What did the user actually ask? (sometimes the issue is the question, not the bot)
- What citations did RAG return? (mismatched citations → corpus needs more docs or better embeddings)
- What was the system prompt at the time? (CONFIG KV might have stale override)

Quick checks:
```bash
# Anything failing in the last hour?
bunx wrangler tail --format=pretty                                # live
# Or look at:
#   dash.cloudflare.com → Workers → <bot-name>-mcp → Logs

# Last few LLM calls + cost:
#   dash.cloudflare.com → AI → AI Gateway → <gateway> → Logs

# Is RAG still working?
curl -sX POST <worker-url>/test \
  -d '{"from":"9999999999","text":"<domain-specific question>"}' \
  -H 'content-type: application/json' | jq '.citations'
```

Common patterns:
- Empty `citations[]` → AutoRAG isn't returning results. Check the instance status and re-sync.
- `model: ""` or LLM 4xx in logs → BYOK key missing or `CF_AI_GATEWAY_TOKEN` rotated.
- Identical reply twice → `DEDUPE` namespace not bound. Verify in `wrangler.toml` and redeploy.
- Replies in wrong language → embedding model is English-only. Recreate AutoRAG with `@cf/baai/bge-m3`.

---

## Conventions

- Always reflect actions back: "Setting system prompt (453 chars). Worker reads on next message."
- Confirm dangerous ops before running: replacing the system prompt with empty, deleting corpus files, batch-sending messages.
- After any change that affects user-visible behavior, propose a `/test` smoke test with a relevant query to verify.
- Never echo secret values — the `get_status` tool only returns boolean presence flags, follow the same convention in any new tools you build.

## When the user mentions deco studio

If the bot's MCP is registered in studio, the user can do most of this from studio's UI (clicking on tools, filling in arguments, reading responses) — no curl needed. Offer to run the same operations via curl when they don't have studio open, or when they want the result piped through `jq`.

Studio's tool catalog comes from `tools/list` on `/mcp`. New tools added to `api/mcp/tools.ts` show up automatically after redeploy.
