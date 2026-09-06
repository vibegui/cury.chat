// Cloudflare AI Gateway client. Pattern mirrors:
//   /Users/guilherme/conductor/workspaces/myvet/biarritz-v1/api/ai/gateway.ts
//
// Two modes the worker supports:
//
//  1. UNIFIED BILLING (default) — `LLM_PROVIDER = "compat"`
//     Hit https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/compat/chat/completions
//     with an OpenAI-shaped body. Model uses CF's slug (e.g.
//     "google-ai-studio/gemini-2.5-flash"). Billed against the AI Gateway
//     credits balance — no provider key needed in the Worker; Cloudflare pays
//     the upstream provider. Requires a CF AI Gateway token (CF_AI_GATEWAY_TOKEN).
//
//  2. PER-PROVIDER (BYOK or pass-through) — `LLM_PROVIDER = "openrouter"`
//     Hit /<provider-slug>/v1/chat/completions. Either ship a provider key in
//     the Worker secret (e.g. OPENROUTER_API_KEY) or configure BYOK in the
//     Gateway dashboard and omit the Authorization header (Gateway injects it).
//
// `generate.ts` switches on LLM_PROVIDER and calls the right helper.

import type { Env } from "../env.ts";

// Provider slugs as they appear in the AI Gateway URL. Some aren't the
// obvious name (perplexity is published as `perplexity-ai`).
const PROVIDER_SLUG: Record<string, string> = {
	openrouter: "openrouter",
	anthropic: "anthropic",
	"google-ai-studio": "google-ai-studio",
	perplexity: "perplexity-ai",
};

export function gatewayUrl(env: Env, provider: string, path: string): string {
	const slug = PROVIDER_SLUG[provider] ?? provider;
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/${slug}${path}`;
}

export function compatUrl(env: Env): string {
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/compat/chat/completions`;
}

// `cf-aig-authorization` is the Authenticated-Gateway header. Distinct from the
// `Authorization` header (which carries the provider key on per-provider paths,
// or the gateway billing token on `/compat`).
function gatewayAuthHeader(env: Env): Record<string, string> {
	return env.CF_AI_GATEWAY_TOKEN
		? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` }
		: {};
}

// Tag every request so it's filterable in the Gateway dashboard.
function gatewayMetadataHeader(
	meta: Record<string, string | number | undefined>,
): Record<string, string> {
	const clean: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(meta)) {
		if (v !== undefined) clean[k] = v;
	}
	return Object.keys(clean).length > 0 ? { "cf-aig-metadata": JSON.stringify(clean) } : {};
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatCompletionResult {
	text: string;
	model: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	raw: any;
}

export interface ChatCompletionOptions {
	model?: string; // defaults to env.LLM_MODEL
	temperature?: number;
	maxTokens?: number;
	metadata?: Record<string, string | number | undefined>;
}

type ChatCompletionJson = {
	choices: Array<{ message: { content: string }; finish_reason?: string }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	model?: string;
};

/**
 * Unified-billing path. Send an OpenAI-shaped chat-completions body to the
 * Gateway's `/compat` endpoint. The `model` field carries the provider prefix
 * Cloudflare uses (e.g. "google-ai-studio/gemini-2.5-flash", "anthropic/claude-...",
 * "openai/gpt-4o-mini", "@cf/meta/llama-3.3-70b-instruct-fp8-fast").
 *
 * Auth: `Authorization: Bearer <CF_AI_GATEWAY_TOKEN>` — the Gateway pays the
 * upstream provider from your AI Gateway credit balance.
 */
export async function compatChat(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
	if (!env.CF_AI_GATEWAY_TOKEN) {
		throw new Error(
			"CF_AI_GATEWAY_TOKEN is not set. Unified-billing /compat requires a Gateway token. " +
				"Create one at dash.cloudflare.com → AI → AI Gateway → your gateway → " +
				"`Create a token`, then `wrangler secret put CF_AI_GATEWAY_TOKEN`.",
		);
	}
	const model = options.model ?? env.LLM_MODEL;

	const headers: Record<string, string> = {
		"content-type": "application/json",
		Authorization: `Bearer ${env.CF_AI_GATEWAY_TOKEN}`,
		...gatewayMetadataHeader(options.metadata ?? {}),
	};

	const body = {
		model,
		messages,
		temperature: options.temperature ?? 0.7,
		max_tokens: options.maxTokens ?? 1024,
	};

	const res = await fetch(compatUrl(env), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		throw new Error(`compat via gateway: ${res.status} ${await res.text()}`);
	}

	const json = (await res.json()) as ChatCompletionJson;
	const text = json.choices?.[0]?.message?.content ?? "";
	return { text, model: json.model ?? model, usage: json.usage, raw: json };
}

/**
 * Per-provider path through OpenRouter. Used when LLM_PROVIDER="openrouter"
 * — either with a Worker-held key (OPENROUTER_API_KEY) or with BYOK
 * configured in the Gateway dashboard (no Authorization header sent).
 */
export async function openrouterChat(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
	const model = options.model ?? env.LLM_MODEL;

	const headers: Record<string, string> = {
		"content-type": "application/json",
		// OpenRouter app-attribution headers (public, not auth).
		"HTTP-Referer": "https://cury.chat",
		"X-Title": "Cury Chat",
		...gatewayAuthHeader(env),
		...gatewayMetadataHeader(options.metadata ?? {}),
	};
	if (env.OPENROUTER_API_KEY) {
		headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
	}

	const body = {
		model,
		messages,
		temperature: options.temperature ?? 0.7,
		max_tokens: options.maxTokens ?? 1024,
	};

	const res = await fetch(gatewayUrl(env, "openrouter", "/v1/chat/completions"), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		throw new Error(`openrouter via gateway: ${res.status} ${await res.text()}`);
	}

	const json = (await res.json()) as ChatCompletionJson;
	const text = json.choices?.[0]?.message?.content ?? "";
	return { text, model: json.model ?? model, usage: json.usage, raw: json };
}

/**
 * Dispatch based on LLM_PROVIDER. Falls back to compatChat (unified billing).
 */
export async function chat(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
	const provider = (env.LLM_PROVIDER || "compat").toLowerCase();
	switch (provider) {
		case "openrouter":
			return openrouterChat(env, messages, options);
		case "compat":
		default:
			return compatChat(env, messages, options);
	}
}
