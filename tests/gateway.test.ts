// Pure-function tests for the AI Gateway URL builders.

import { describe, expect, test } from "bun:test";
import { chat, compatUrl, gatewayUrl } from "../api/ai/gateway.ts";

const env = {
	AI_GATEWAY_ACCOUNT_ID: "abc-account",
	AI_GATEWAY_NAME: "default",
} as any;

describe("gatewayUrl", () => {
	test("builds the canonical CF AI Gateway URL", () => {
		const u = gatewayUrl(env, "openrouter", "/v1/chat/completions");
		expect(u).toBe(
			"https://gateway.ai.cloudflare.com/v1/abc-account/default/openrouter/v1/chat/completions",
		);
	});

	test("perplexity provider gets the `-ai` suffix slug", () => {
		// Real CF quirk — pinned so we notice if it ever flips.
		expect(gatewayUrl(env, "perplexity", "/chat/completions")).toContain("/perplexity-ai/");
	});

	test("anthropic provider keeps name as-is", () => {
		expect(gatewayUrl(env, "anthropic", "/v1/messages")).toContain("/anthropic/v1/messages");
	});

	test("google-ai-studio provider keeps the hyphenated name", () => {
		expect(
			gatewayUrl(env, "google-ai-studio", "/v1beta/models/gemini-2.5-flash:generateContent"),
		).toContain("/google-ai-studio/v1beta/models/gemini-2.5-flash:generateContent");
	});

	test("unknown provider falls through verbatim", () => {
		// Lets forks add new providers without code change (slug map miss → identity).
		expect(gatewayUrl(env, "moonshot", "/v1/x")).toContain("/moonshot/v1/x");
	});

	test("uses configured gateway name", () => {
		const named = { ...env, AI_GATEWAY_NAME: "cury" };
		expect(gatewayUrl(named, "openrouter", "/v1/chat/completions")).toContain(
			"/abc-account/cury/openrouter/",
		);
	});
});

describe("compatUrl", () => {
	test("builds the /compat unified-billing endpoint", () => {
		expect(compatUrl(env)).toBe(
			"https://gateway.ai.cloudflare.com/v1/abc-account/default/compat/chat/completions",
		);
	});

	test("respects gateway name", () => {
		const named = { ...env, AI_GATEWAY_NAME: "custom" };
		expect(compatUrl(named)).toContain("/custom/compat/chat/completions");
	});
});

// O teto de saída é 4096, não 1024. Um teto baixo faz modelo que raciocina
// gastar tudo pensando e devolver conteúdo vazio — medido em três modelos, ver
// o comentário em gateway.ts. Este teste existe para que ninguém "otimize" o
// número de volta sem ler aquilo.
describe("teto de tokens de saída", () => {
	test("o padrão é 4096", async () => {
		let sent: any;
		const fetchSpy = async (_url: string, init: RequestInit) => {
			sent = JSON.parse(init.body as string);
			return new Response(
				JSON.stringify({ choices: [{ message: { content: "oi" } }], model: "m", usage: {} }),
				{ headers: { "content-type": "application/json" } },
			);
		};
		const original = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		try {
			await chat({ ...env, LLM_PROVIDER: "openrouter", LLM_MODEL: "m" } as any, [
				{ role: "user", content: "oi" },
			]);
		} finally {
			globalThis.fetch = original;
		}
		expect(sent.max_tokens).toBe(4096);
	});
});
