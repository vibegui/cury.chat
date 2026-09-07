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
import type { Env } from "../env.ts";
import { threadIdFor } from "../lib/thread-id.ts";
import { loadThread } from "../pipeline/persist.ts";
import { runTurn } from "../pipeline/turn.ts";

interface TestRequest {
	from?: string;
	text?: string;
	persist?: boolean; // default true; set false for one-off tests
	model?: string; // overrides env.LLM_MODEL, for side-by-side model comparison
	// Provider reasoning control, passed through verbatim. `{"enabled":false}`
	// forces it off, `{"effort":"medium"}` turns it on. Used by
	// scripts/benchmark.ts to price reasoning on the same question.
	reasoning?: Record<string, unknown>;
	// Output-token ceiling, overriding the default in gateway.ts. The benchmark
	// moves it to find out whether truncation, not capability, is what makes a
	// reasoning model come back empty.
	maxTokens?: number;
	// Devolve o bloco <context> literal. Só o benchmark usa — ver turn.ts.
	includeContext?: boolean;
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

	const result = await runTurn(c.env, {
		threadId,
		text,
		model: body.model,
		reasoning: body.reasoning,
		maxTokens: body.maxTokens,
		includeContext: body.includeContext,
		persist: body.persist !== false,
		metadata: { phone: from, source: "test-endpoint" },
	});

	return c.json({
		reply: result.reply,
		threadId,
		thread_length_before: result.threadLengthBefore,
		citations: result.citations.map((x) => ({ source: x.source, score: x.score })),
		model: result.model,
		usage: result.usage,
		...(result.context ? { context: result.context } : {}),
		timings_ms: {
			total: Date.now() - started,
			retrieve: result.timingsMs.retrieve,
			generate: result.timingsMs.generate,
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
