// Bindings & secrets contract for the worker.
// Mirrors wrangler.toml exactly; if you add/remove a binding there, update this file too.

export interface Env {
	// ---- Bindings ----
	DEDUPE: KVNamespace;
	THREADS: KVNamespace;
	CONFIG: KVNamespace;
	CORPUS: R2Bucket;
	AI: any;
	AUTORAG: AiSearchInstance;

	// ---- Non-secret vars (wrangler.toml [vars]) ----
	AI_GATEWAY_ACCOUNT_ID: string;
	AI_GATEWAY_NAME: string;
	LLM_MODEL: string;
	LLM_PROVIDER: string;
	META_PHONE_NUMBER_ID: string;
	META_API_VERSION: string;
	AUTORAG_INSTANCE: string;

	// ---- Secrets (wrangler secret put / .dev.vars) ----
	OPENROUTER_API_KEY?: string;
	CF_AI_GATEWAY_TOKEN?: string;
	META_ACCESS_TOKEN?: string;
	META_APP_SECRET?: string;
	META_VERIFY_TOKEN?: string;
	// Gate for the /mcp and /test endpoints. If unset, gate is open (dev).
	// Generate: `openssl rand -hex 32` then `wrangler secret put MCP_AUTH_TOKEN`.
	MCP_AUTH_TOKEN?: string;
}
