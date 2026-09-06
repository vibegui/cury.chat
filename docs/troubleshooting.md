> Herdado do template mangabeira e mantido porque quase tudo ainda vale.
> Entradas específicas do Tyxter estão em [`tyxter.md`](tyxter.md).

# Troubleshooting

**Meta says webhook URL fails verification.** Your `META_VERIFY_TOKEN` secret doesn't byte-match the token in Meta's webhook form. They must be identical. Reset: `wrangler secret put META_VERIFY_TOKEN` and re-save the form.

**`401 invalid signature` in logs after Meta delivers.** The `META_APP_SECRET` you set belongs to a Meta app other than the one delivering these webhooks (Meta apps have their own secret). Either acquire the correct one or delete the secret (`wrangler secret delete META_APP_SECRET`); the worker accepts unsigned webhooks when no secret is set.

**`401 Unauthorized` (code 2009) from the AI Gateway.** Authenticated Gateway is on but `CF_AI_GATEWAY_TOKEN` is missing. Set it via `wrangler secret put CF_AI_GATEWAY_TOKEN` with the `cf-aig-…` token from `Settings → Authenticated Gateway`.

**`openrouter via gateway: 401`** but `CF_AI_GATEWAY_TOKEN` is set. Means BYOK for OpenRouter isn't configured in the Gateway dashboard, and `OPENROUTER_API_KEY` isn't set either. Pick one:
- Add the OpenRouter key under **Provider Keys → OpenRouter** in the AI Gateway dashboard (BYOK)
- Or `wrangler secret put OPENROUTER_API_KEY`

**`ragEnabled: false`.** `AUTORAG_INSTANCE` in `wrangler.toml` is empty or doesn't match a real AI Search instance. Set it and redeploy. Confirm with `bunx wrangler ai-search list`.

**Worker bundles fine but `/test` returns `internal`.** Tail logs (`wrangler tail`) — first line of the error is almost always the issue (missing secret, wrong model id, gateway misconfig).

**Bot replies in English when user wrote Portuguese.** Make sure your AutoRAG embedding model is multilingual — `bge-m3` works well, `bge-large-en-v1.5` does not. Recreate the instance if needed.

**MCP calls from studio return 401.** `MCP_AUTH_TOKEN` is set on the worker but the URL studio uses doesn't pass it. Edit the connection in studio and append `?token=<MCP_AUTH_TOKEN>` to the Remote URL.

**`MCP_AUTH_TOKEN is not set — control plane is OPEN to the internet`** in logs. Run `openssl rand -hex 32 | wrangler secret put MCP_AUTH_TOKEN` and reconfigure your MCP client(s) with the same value.

**`/webhook` is still unauthenticated.** Correct — Meta doesn't support custom headers when delivering webhooks. The original protection is `x-hub-signature-256` HMAC via `META_APP_SECRET`. If you can't get that secret (different app owner), you can either accept the risk (the worst case is wasted LLM credits + spam-replies to crafted phone numbers in fake payloads) or add a random path segment to your webhook URL (e.g. `/webhook/<uuid>`) and update `configure-webhook.ts` to use it — making the URL itself the shared secret.

**Conversation memory bleeds across days.** Intentional: threads roll over daily (`api/lib/thread-id.ts`). Change the date in the key format to whatever rollover cadence you want, or remove the date entirely for continuous memory.

**Same message answered twice.** `DEDUPE` namespace isn't bound correctly. Check `wrangler.toml`'s `[[kv_namespaces]] DEDUPE` block has a real id. Also confirm the worker is the one Meta is actually delivering to (`bun run configure-webhook --show`).

---

