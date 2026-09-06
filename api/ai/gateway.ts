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

/**
 * Both providers speak the same OpenAI-shaped body over the Gateway; only the
 * URL and the auth headers differ. Building the request once keeps the
 * streaming and non-streaming paths from drifting apart — a `max_tokens` fixed
 * in one and not the other is exactly the kind of bug that only shows up in
 * whichever path the tests don't cover.
 */
function buildRequest(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions,
	stream: boolean,
): { url: string; headers: Record<string, string>; body: string } {
	const provider = (env.LLM_PROVIDER || "compat").toLowerCase();
	const model = options.model ?? env.LLM_MODEL;

	const common = {
		model,
		messages,
		temperature: options.temperature ?? 0.7,
		max_tokens: options.maxTokens ?? 1024,
		...(stream
			? // Without include_usage the final chunk carries no token counts, and
				// the turn would be stored with no cost — invisible in the dashboard.
				{ stream: true, stream_options: { include_usage: true } }
			: {}),
	};

	if (provider === "openrouter") {
		const headers: Record<string, string> = {
			"content-type": "application/json",
			// OpenRouter app-attribution headers (public, not auth).
			"HTTP-Referer": "https://cury.chat",
			"X-Title": "Cury Chat",
			...gatewayAuthHeader(env),
			...gatewayMetadataHeader(options.metadata ?? {}),
		};
		if (env.OPENROUTER_API_KEY) headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
		return {
			url: gatewayUrl(env, "openrouter", "/v1/chat/completions"),
			headers,
			body: JSON.stringify(common),
		};
	}

	if (!env.CF_AI_GATEWAY_TOKEN) {
		throw new Error(
			"CF_AI_GATEWAY_TOKEN is not set. Unified-billing /compat requires a Gateway token. " +
				"Create one at dash.cloudflare.com → AI → AI Gateway → your gateway → " +
				"`Create a token`, then `wrangler secret put CF_AI_GATEWAY_TOKEN`.",
		);
	}
	return {
		url: compatUrl(env),
		headers: {
			"content-type": "application/json",
			Authorization: `Bearer ${env.CF_AI_GATEWAY_TOKEN}`,
			...gatewayMetadataHeader(options.metadata ?? {}),
		},
		body: JSON.stringify(common),
	};
}

type ChatCompletionJson = {
	choices: Array<{ message: { content: string }; finish_reason?: string }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	model?: string;
};

export async function chat(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
	const { url, headers, body } = buildRequest(env, messages, options, false);
	const provider = (env.LLM_PROVIDER || "compat").toLowerCase();

	const res = await fetch(url, { method: "POST", headers, body });
	if (!res.ok) {
		throw new Error(`${provider} via gateway: ${res.status} ${await res.text()}`);
	}

	const json = (await res.json()) as ChatCompletionJson;
	const text = json.choices?.[0]?.message?.content ?? "";
	return {
		text,
		model: json.model ?? options.model ?? env.LLM_MODEL,
		usage: json.usage,
		raw: json,
	};
}

export type ChatStreamEvent =
	| { type: "delta"; text: string }
	| { type: "done"; text: string; model: string; usage?: ChatCompletionResult["usage"] };

type StreamChunk = {
	choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
	usage?: ChatCompletionResult["usage"];
	model?: string;
};

/**
 * Same call with `stream: true`, yielded as it arrives.
 *
 * The response is Server-Sent Events: `data: {json}` records separated by blank
 * lines, terminated by `data: [DONE]`. Two things make a naive reader wrong:
 * a chunk boundary can land mid-record, so the tail must be buffered rather
 * than parsed; and providers emit keep-alive comments and blank lines that are
 * not JSON. Both are handled below.
 */
export async function* chatStream(
	env: Env,
	messages: ChatMessage[],
	options: ChatCompletionOptions = {},
): AsyncGenerator<ChatStreamEvent> {
	const { url, headers, body } = buildRequest(env, messages, options, true);
	const provider = (env.LLM_PROVIDER || "compat").toLowerCase();

	const res = await fetch(url, { method: "POST", headers, body });
	if (!res.ok || !res.body) {
		throw new Error(`${provider} via gateway: ${res.status} ${await res.text()}`);
	}

	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	let text = "";
	let model = options.model ?? env.LLM_MODEL;
	let usage: ChatCompletionResult["usage"];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += value;

			// Keep the trailing partial line in the buffer for the next chunk.
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith(":")) continue; // blank or keep-alive
				if (!trimmed.startsWith("data:")) continue;

				const payload = trimmed.slice(5).trim();
				if (payload === "[DONE]") continue;

				let chunk: StreamChunk;
				try {
					chunk = JSON.parse(payload) as StreamChunk;
				} catch {
					continue; // a malformed record should not kill a live answer
				}

				if (chunk.model) model = chunk.model;
				if (chunk.usage) usage = chunk.usage;

				const delta = chunk.choices?.[0]?.delta?.content;
				if (delta) {
					text += delta;
					yield { type: "delta", text: delta };
				}
			}
		}
	} finally {
		// Releasing the lock matters when the consumer breaks out early — an
		// abandoned reader holds the upstream connection open.
		reader.releaseLock();
	}

	yield { type: "done", text, model, usage };
}
