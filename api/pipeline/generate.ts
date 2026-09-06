// Build the chat-completions call and invoke the LLM through CF AI Gateway.

import { type ChatMessage, chat, chatStream } from "../ai/gateway.ts";
import type { Env } from "../env.ts";
import type { CitationRef, Turn } from "./persist.ts";
import { type Citation, formatCitationsBlock } from "./retrieve.ts";

// Cap stored snippet length to keep thread payloads in KV reasonable while still
// showing a meaningful excerpt of the cited passage.
const SNIPPET_MAX = 600;

export interface GenerateInput {
	/** Overrides env.LLM_MODEL. Used by /test to A/B models without redeploying. */
	model?: string;
	systemPrompt: string;
	thread: Turn[];
	userMessage: string;
	citations: Citation[];
	recipientName?: string;
	// Pre-formatted <memory> block summarizing prior days' conversations. Empty
	// when there's no cross-day history yet.
	memory?: string;
	metadata?: Record<string, string>;
}

export interface GenerateResult {
	text: string;
	model: string;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	citationsUsed: CitationRef[];
}

function buildMessages(input: GenerateInput): ChatMessage[] {
	return [
		{ role: "system", content: buildSystem(input) },
		...input.thread.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
		{ role: "user", content: input.userMessage },
	];
}

function citationsUsed(input: GenerateInput): CitationRef[] {
	return input.citations.map((c) => ({
		source: c.source,
		text: c.text.length > SNIPPET_MAX ? `${c.text.slice(0, SNIPPET_MAX)}…` : c.text,
		score: c.score,
	}));
}

export async function generate(env: Env, input: GenerateInput): Promise<GenerateResult> {
	const messages = buildMessages(input);

	const result = await chat(env, messages, {
		metadata: input.metadata,
		model: input.model,
	});

	return {
		text: result.text,
		model: result.model,
		usage: result.usage,
		citationsUsed: citationsUsed(input),
	};
}

/**
 * Same prompt assembly, streamed. Yields text deltas and finishes with the
 * assembled GenerateResult, so a caller can render as it arrives and still
 * persist one complete turn at the end.
 */
export async function* generateStream(
	env: Env,
	input: GenerateInput,
): AsyncGenerator<{ type: "delta"; text: string } | { type: "done"; result: GenerateResult }> {
	const messages = buildMessages(input);

	for await (const event of chatStream(env, messages, {
		metadata: input.metadata,
		model: input.model,
	})) {
		if (event.type === "delta") {
			yield event;
		} else {
			yield {
				type: "done",
				result: {
					text: event.text,
					model: event.model,
					usage: event.usage,
					citationsUsed: citationsUsed(input),
				},
			};
		}
	}
}

function buildSystem(input: GenerateInput): string {
	const blocks: string[] = [input.systemPrompt];
	if (input.recipientName) {
		blocks.push(`<recipient>\nNome do interlocutor: ${input.recipientName}\n</recipient>`);
	}
	if (input.memory) blocks.push(input.memory);
	const ctx = formatCitationsBlock(input.citations);
	if (ctx) blocks.push(ctx);
	return blocks.join("\n\n");
}
