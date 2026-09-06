# Deploy guide

End-to-end deployment, ~30 minutes.

## 0. Prerequisites

- `bun` ≥ 1.0 (`curl -fsSL https://bun.sh/install | bash`)
- `wrangler` ≥ 4 (`bun add -g wrangler`, then `wrangler login`)
- A Cloudflare account
- A Meta WhatsApp Business account with a phone number connected
- An OpenRouter API key

## 1. Cloudflare resources

Run these from the repo root. The exact KV namespace IDs and account ID you'll paste back into `wrangler.toml`.

### Account ID

`wrangler whoami` — copy the account id printed at the top. Paste it into `wrangler.toml` as `AI_GATEWAY_ACCOUNT_ID`.

### KV namespaces (×3)

```bash
wrangler kv namespace create DEDUPE
wrangler kv namespace create THREADS
wrangler kv namespace create CONFIG
```

Each command prints an `id`. Paste each one into `wrangler.toml` next to the matching `binding`.

### R2 bucket

```bash
wrangler r2 bucket create cury-corpus
```

(If you fork, pick your own bucket name and update `wrangler.toml`.)

### AI Gateway

Open <https://dash.cloudflare.com/?to=/:account/ai/ai-gateway> → **Create Gateway**. Give it a name (e.g. `cury`). Copy the name into `wrangler.toml` as `AI_GATEWAY_NAME`.

If you turned on **Authenticated Gateway**, create a token and set:

```bash
wrangler secret put CF_AI_GATEWAY_TOKEN
```

If you didn't, skip this — leave the secret unset.

### AutoRAG (the corpus retrieval)

Skip this and the corpus upload below if you only want a prompt-only bot — set `AUTORAG_INSTANCE = ""` in `wrangler.toml` and you're done.

**Option A — wrangler CLI (faster, but needs a one-time token):**

```bash
# Get the AI Search API token (one-time, click "Create token" on the page):
open "https://dash.cloudflare.com/<account-id>/ai/ai-search/tokens"
# Wrangler picks it up automatically once it's created on your account.

bun run upload-corpus --remote   # do this first; AutoRAG indexes what's in R2

bunx wrangler ai-search create cury \
  --type r2 \
  --source cury-corpus \
  --embedding-model "@cf/baai/bge-m3" \
  --hybrid-search \
  --reranking
```

**Option B — Dashboard (no extra token):**

1. Open <https://dash.cloudflare.com/?to=/:account/ai/autorag> → **Create**.
2. Source: the `cury-corpus` R2 bucket you created above.
3. Embedding model: `@cf/baai/bge-m3` (multilingual — corpus mixes Portuguese and English).
4. Enable hybrid search + reranking for better recall.
5. Give it a name (e.g. `cury`).

Either way, after creating:

- Paste the instance name into `wrangler.toml` as `AUTORAG_INSTANCE`.
- In the AutoRAG dashboard, click **Sync** (or wait for the scheduled scan) so it indexes the corpus.

You'll come back here in step 4 to trigger a sync after uploading the corpus.

## 2. Secrets

```bash
wrangler secret put META_ACCESS_TOKEN    # see docs/whatsapp-setup.md §2
wrangler secret put META_APP_SECRET      # see docs/whatsapp-setup.md §3
wrangler secret put META_VERIFY_TOKEN    # pick any string — paste the same one into Meta later
```

**OpenRouter key**: not needed if you've configured **BYOK** in the AI Gateway
dashboard (`dash.cloudflare.com → AI → AI Gateway → your gateway → Providers →
OpenRouter → Add API key`). The Gateway then injects the key on every call,
and the Worker omits the `Authorization` header.

If you haven't set up BYOK, also run:

```bash
wrangler secret put OPENROUTER_API_KEY   # https://openrouter.ai/keys
```

And if you enabled Authenticated Gateway:

```bash
wrangler secret put CF_AI_GATEWAY_TOKEN
```

For local development, copy `.dev.vars.example` → `.dev.vars` and fill in the same values. Wrangler reads `.dev.vars` automatically when you run `wrangler dev`.

## 3. Non-secret config

Edit `wrangler.toml`'s `[vars]` block:

| Var | What |
|---|---|
| `AI_GATEWAY_ACCOUNT_ID` | Your Cloudflare account id (right sidebar of any dashboard page) |
| `AI_GATEWAY_NAME` | The gateway name from step 1 |
| `LLM_MODEL` | OpenRouter model id. Default: `google/gemini-3.5-flash`. Try `anthropic/claude-sonnet-4-6` for higher quality, lower throughput. |
| `META_PHONE_NUMBER_ID` | From WhatsApp → API Setup; see docs/whatsapp-setup.md §1 |
| `AUTORAG_INSTANCE` | Name from step 1's AutoRAG instance |

## 4. Upload the corpus

```bash
bun run upload-corpus --remote
```

Then, in the AutoRAG dashboard, click **Sync** on your instance to make it index the new objects. First indexing run can take a few minutes for the full 16 MB / 17 markdown files.

## 5. Deploy the worker

```bash
bun install
bun run deploy
```

This prints your worker URL — typically `https://cury-mcp.<your-subdomain>.workers.dev`. **Copy it; you need it for the next step.**

Verify it's alive:

```bash
curl https://cury-mcp.<your-subdomain>.workers.dev/health
# → {"name":"cury-mcp","ok":true,"model":"google/gemini-3.5-flash","provider":"openrouter","ragEnabled":true}
```

## 6. Point Meta at the new webhook

See [`whatsapp-setup.md`](whatsapp-setup.md) for the click path with the exact URL.

## 7. Smoke test

```bash
wrangler tail
```

From any phone, message your WhatsApp Business number with "Olá". Within a few seconds:

- `wrangler tail` shows the webhook hit, RAG retrieve, generate, and send.
- Your phone receives the bot's reply.

You should see one of these in the tail:

```
turn ok { threadId: '5511…:2026-05-26', ms: 4120, model: 'google/gemini-3.5-flash', tokens: 6400, citations: 6 }
```

If nothing happens, see [troubleshooting](#troubleshooting).

---

## Troubleshooting

**Meta says the webhook URL fails to verify.** Your `META_VERIFY_TOKEN` secret doesn't match the value pasted into Meta's webhook form. They have to be byte-identical.

**`401 invalid signature` in logs.** The `META_APP_SECRET` secret is wrong or unset. Reset it via `wrangler secret put META_APP_SECRET` using the **App Secret** from <https://developers.facebook.com/apps> → Your app → Settings → Basic.

**`OPENROUTER_API_KEY is not set`.** `wrangler secret put OPENROUTER_API_KEY` and re-deploy. The worker reads secrets at request time so no redeploy is needed — but verify with `curl /health` that it's healthy.

**Replies arrive but cite nothing / `ragEnabled:false`.** AutoRAG instance name in `wrangler.toml` is empty or doesn't match. Set `AUTORAG_INSTANCE` and re-deploy.

**Replies arrive but only sometimes.** Check `wrangler tail` for `dedupe hit` — Meta retried before you finished. This is benign as long as you got at least one reply.

**Same reply twice.** Dedupe KV not bound. Re-check `wrangler.toml`'s `DEDUPE` namespace and re-deploy.
