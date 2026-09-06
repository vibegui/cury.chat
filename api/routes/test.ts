// POST /test  — run the full inbound pipeline without going through Meta.
//
// Used for smoke-testing the worker end-to-end before WhatsApp is wired up.
// Skips: signature verification, dedupe, Meta send. Returns the LLM reply
// (plus citations + thread state) directly in the response.
//
// Same code paths as the real /webhook handler — only difference is the reply
// is in the HTTP response instead of being POSTed to graph.facebook.com.
//
// Usage:
//   curl -sX POST https://cury-mcp.deco-ceo.workers.dev/test \
//     -H 'content-type: application/json' \
//     -d '{"from":"5511999999999","text":"O que é democracia de alta energia?"}' | jq

import { Hono } from "hono";
import { loadSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { threadIdFor } from "../lib/thread-id.ts";
import { generate } from "../pipeline/generate.ts";
import { appendTurns, loadThread } from "../pipeline/persist.ts";
import { retrieve } from "../pipeline/retrieve.ts";

interface TestRequest {
	from?: string;
	text?: string;
	persist?: boolean; // default true; set false for one-off tests
}

export const testRoute = new Hono<{ Bindings: Env }>();

testRoute.post("/", async (c) => {
	const started = Date.now();
	const body = (await c.req.json().catch(() => ({}))) as TestRequest;

	const from = body.from?.trim();
	const text = body.text?.trim();
	if (!from || !text) {
		return c.json({ error: "Need { from, text }" }, 400);
	}

	const threadId = threadIdFor(from);
	const [thread, systemPrompt] = await Promise.all([
		loadThread(c.env, threadId),
		loadSystemPrompt(c.env),
	]);

	const retrieveStart = Date.now();
	const citations = await retrieve(c.env, text).catch(() => []);
	const retrieveMs = Date.now() - retrieveStart;

	const generateStart = Date.now();
	const result = await generate(c.env, {
		systemPrompt,
		thread,
		userMessage: text,
		citations,
		metadata: { phone: from, threadId, source: "test-endpoint" },
	});
	const generateMs = Date.now() - generateStart;

	if (body.persist !== false) {
		await appendTurns(c.env, threadId, [
			{ role: "user", content: text, ts: Date.now() },
			{
				role: "assistant",
				content: result.text,
				ts: Date.now(),
				model: result.model,
				usage: result.usage,
				citations: result.citationsUsed,
			},
		]);
	}

	return c.json({
		reply: result.text,
		threadId,
		thread_length_before: thread.length,
		citations: citations.map((c) => ({ source: c.source, score: c.score })),
		model: result.model,
		usage: result.usage,
		timings_ms: {
			total: Date.now() - started,
			retrieve: retrieveMs,
			generate: generateMs,
		},
		ragEnabled: !!c.env.AUTORAG_INSTANCE,
	});
});

testRoute.get("/thread", async (c) => {
	const from = c.req.query("from");
	if (!from) return c.json({ error: "Need ?from=<phone>" }, 400);
	const threadId = threadIdFor(from);
	const thread = await loadThread(c.env, threadId);
	return c.json({ threadId, length: thread.length, turns: thread });
});

testRoute.delete("/thread", async (c) => {
	const from = c.req.query("from");
	if (!from) return c.json({ error: "Need ?from=<phone>" }, 400);
	const threadId = threadIdFor(from);
	await c.env.THREADS.delete(`t:${threadId}`);
	return c.json({ deleted: threadId });
});
