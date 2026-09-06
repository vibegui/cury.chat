// One conversational turn, independent of how it arrived.
//
// Everything except the transport: load history, retrieve, generate, persist.
// /test, the web chat and (indirectly) the WhatsApp path all run this — so the
// bot cannot say one thing on WhatsApp and another on the web, and the guard
// rails in the system prompt only have to hold in one place.

import { loadSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { generate, generateStream } from "./generate.ts";
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

/**
 * Everything a turn needs before the model is called. Shared so the streaming
 * and non-streaming paths cannot retrieve differently.
 */
async function prepare(env: Env, input: RunTurnInput) {
	const [thread, systemPrompt] = await Promise.all([
		loadThread(env, input.threadId),
		loadSystemPrompt(env),
	]);

	// A retrieval failure degrades the answer; it should never lose the turn.
	// The system prompt already tells the model to admit an empty context.
	const retrieveStart = Date.now();
	const citations = await retrieve(env, input.text).catch((err) => {
		console.warn("retrieve failed", err);
		return [];
	});

	return {
		thread,
		systemPrompt,
		citations,
		retrieveMs: Date.now() - retrieveStart,
		generateInput: {
			model: input.model,
			systemPrompt,
			thread,
			userMessage: input.text,
			citations,
			recipientName: input.name,
			memory: input.memory,
			metadata: { threadId: input.threadId, ...input.metadata },
		},
	};
}

async function persistTurn(
	env: Env,
	input: RunTurnInput,
	result: { text: string; model: string; usage?: Turn["usage"]; citationsUsed: CitationRef[] },
): Promise<void> {
	const ts = Date.now();
	await appendTurns(env, input.threadId, [
		{ role: "user", content: input.text, ts, name: input.name },
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

export async function runTurn(env: Env, input: RunTurnInput): Promise<RunTurnResult> {
	const started = Date.now();
	const prepared = await prepare(env, input);

	const generateStart = Date.now();
	const result = await generate(env, prepared.generateInput);
	const generateMs = Date.now() - generateStart;

	if (input.persist !== false) await persistTurn(env, input, result);

	return {
		reply: result.text,
		threadId: input.threadId,
		threadLengthBefore: prepared.thread.length,
		citations: result.citationsUsed,
		model: result.model,
		usage: result.usage,
		timingsMs: {
			total: Date.now() - started,
			retrieve: prepared.retrieveMs,
			generate: generateMs,
		},
	};
}

export type TurnStreamEvent =
	| { type: "delta"; text: string }
	| { type: "done"; result: RunTurnResult };

/**
 * Streaming twin of runTurn. Retrieval still blocks — there is nothing to show
 * until the model starts — but generation is yielded token by token, and the
 * completed turn is persisted before the generator finishes so a reader that
 * consumes to the end always leaves durable state behind.
 */
export async function* runTurnStream(
	env: Env,
	input: RunTurnInput,
): AsyncGenerator<TurnStreamEvent> {
	const started = Date.now();
	const prepared = await prepare(env, input);
	const generateStart = Date.now();

	for await (const event of generateStream(env, prepared.generateInput)) {
		if (event.type === "delta") {
			yield event;
			continue;
		}

		const { result } = event;
		if (input.persist !== false) await persistTurn(env, input, result);

		yield {
			type: "done",
			result: {
				reply: result.text,
				threadId: input.threadId,
				threadLengthBefore: prepared.thread.length,
				citations: result.citationsUsed,
				model: result.model,
				usage: result.usage,
				timingsMs: {
					total: Date.now() - started,
					retrieve: prepared.retrieveMs,
					generate: Date.now() - generateStart,
				},
			},
		};
	}
}
