// Pure-function tests for the AI Gateway URL builders.

import { describe, expect, test } from "bun:test";
import { compatUrl, gatewayUrl } from "../api/ai/gateway.ts";

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
