// One conversational turn, independent of how it arrived.
//
// Everything except the transport: load history, retrieve, generate, persist.
// /test, the web chat and (indirectly) the WhatsApp path all run this — so the
// bot cannot say one thing on WhatsApp and another on the web, and the guard
// rails in the system prompt only have to hold in one place.

import { loadSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { generate } from "./generate.ts";
import { appendTurns, type CitationRef, loadThread, type Turn } from "./persist.ts";
import { retrieve } from "./retrieve.ts";

export interface RunTurnInput {
	threadId: string;
	text: string;
	/** Display name of the person, when known. */
	name?: string;
	/** Overrides env.LLM_MODEL — used to A/B models without redeploying. */
	model?: string;
	/** Extra tags for AI Gateway, merged over the defaults. */
	metadata?: Record<string, string>;
	/** Default true. False for one-off probes that shouldn't pollute a thread. */
	persist?: boolean;
	/** Prepended memory block, when the caller keeps one (WhatsApp does). */
	memory?: string;
}

export interface RunTurnResult {
	reply: string;
	threadId: string;
	threadLengthBefore: number;
	citations: CitationRef[];
	model: string;
	usage?: Turn["usage"];
	timingsMs: { total: number; retrieve: number; generate: number };
}

export async function runTurn(env: Env, input: RunTurnInput): Promise<RunTurnResult> {
	const started = Date.now();
	const { threadId, text, name, model, persist = true } = input;

	const [thread, systemPrompt] = await Promise.all([
		loadThread(env, threadId),
		loadSystemPrompt(env),
	]);

	const retrieveStart = Date.now();
	// A retrieval failure degrades the answer; it should never lose the turn.
	// The system prompt already tells the model to admit an empty context.
	const citations = await retrieve(env, text).catch((err) => {
		console.warn("retrieve failed", err);
		return [];
	});
	const retrieveMs = Date.now() - retrieveStart;

	const generateStart = Date.now();
	const result = await generate(env, {
		model,
		systemPrompt,
		thread,
		userMessage: text,
		citations,
		recipientName: name,
		memory: input.memory,
		metadata: { threadId, ...input.metadata },
	});
	const generateMs = Date.now() - generateStart;

	if (persist) {
		const ts = Date.now();
		await appendTurns(env, threadId, [
			{ role: "user", content: text, ts, name },
			{
				role: "assistant",
				content: result.text,
				ts,
				model: result.model,
				usage: result.usage,
				citations: result.citationsUsed,
			},
		]);
	}

	return {
		reply: result.text,
		threadId,
		threadLengthBefore: thread.length,
		citations: result.citationsUsed,
		model: result.model,
		usage: result.usage,
		timingsMs: {
			total: Date.now() - started,
			retrieve: retrieveMs,
			generate: generateMs,
		},
	};
}
