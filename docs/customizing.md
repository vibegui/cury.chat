# Customizing the fork

The whole point of this repo: you take it, change a prompt, change a corpus, ship a new bot.

## Step 1. Change the bot's voice

Edit `prompts/cury-chat.md`. This is the only non-Cloudflare-config file you usually need to touch.

The bundled prompt is loaded at build time via the `[[rules]] type="Text"` rule in `wrangler.toml`. After editing, `bun run deploy` ships the new prompt.

## Step 2. Change the knowledge base

1. Drop your markdown files into `corpus/`. (Anything else? Convert to markdown first — AutoRAG works best with text.)
2. `bun run upload-corpus --remote` to push them to R2.
3. In the Cloudflare AutoRAG dashboard, click **Sync** on your instance.

## Step 3. (Optional) Switch model

Open `wrangler.toml` and change `LLM_MODEL`. Browse [openrouter.ai/models](https://openrouter.ai/models) for the catalog. Anything OpenRouter exposes works — just paste the `<provider>/<model>` id.

Quality vs cost tradeoffs (May 2026):

| Model | Speed | Quality | Notes |
|---|---|---|---|
| `google/gemini-3.5-flash` | fast | good | the default |
| `anthropic/claude-sonnet-4-6` | medium | great | best balance |
| `anthropic/claude-opus-4-7` | slow | best | reserve for hard reasoning |
| `openai/gpt-4o-mini` | fast | ok | cheap fallback |

## Step 4. Edit the live prompt without redeploying

After the first deploy, you can override the bundled prompt via the CONFIG KV:

```bash
wrangler kv key put --binding=CONFIG --remote system-prompt --path my-new-prompt.md
```

Next message uses the new prompt. To revert to bundled, delete the key:

```bash
wrangler kv key delete --binding=CONFIG --remote system-prompt
```

## Fork checklist

- [ ] Replaced `prompts/cury-chat.md`
- [ ] Replaced `corpus/*.md` and re-ran upload-corpus
- [ ] Created own R2 bucket (and updated bucket name in `wrangler.toml`)
- [ ] Created own AutoRAG instance (and updated `AUTORAG_INSTANCE`)
- [ ] Created own KV namespaces (and updated the 3 ids in `wrangler.toml`)
- [ ] Created own AI Gateway (and updated `AI_GATEWAY_ACCOUNT_ID` + `AI_GATEWAY_NAME`)
- [ ] Got own OpenRouter key (`wrangler secret put OPENROUTER_API_KEY`)
- [ ] Got own Meta WhatsApp number + tokens (see `whatsapp-setup.md`)
- [ ] Renamed the worker (`name=` in `wrangler.toml`) so it doesn't collide
- [ ] Updated `agents/cury-chat.json` metadata to your bot's identity (optional)

Repo intentionally has no logic specific to Cury — everything domain-specific lives in `prompts/` and `corpus/`.
