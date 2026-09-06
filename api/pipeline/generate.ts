// Build the chat-completions call and invoke the LLM through CF AI Gateway.

import { type ChatMessage, chat } from "../ai/gateway.ts";
import type { Env } from "../env.ts";
import type { CitationRef, Turn } from "./persist.ts";
import { type Citation, formatCitationsBlock } from "./retrieve.ts";

// Cap stored snippet length to keep thread payloads in KV reasonable while still
// showing a meaningful excerpt of the cited passage.
const SNIPPET_MAX = 600;

export interface GenerateInput {
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

export async function generate(env: Env, input: GenerateInput): Promise<GenerateResult> {
	const systemWithContext = buildSystem(input);

	const messages: ChatMessage[] = [
		{ role: "system", content: systemWithContext },
		...input.thread.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
		{ role: "user", content: input.userMessage },
	];

	const result = await chat(env, messages, {
		metadata: input.metadata,
	});

	return {
		text: result.text,
		model: result.model,
		usage: result.usage,
		citationsUsed: input.citations.map((c) => ({
			source: c.source,
			text: c.text.length > SNIPPET_MAX ? `${c.text.slice(0, SNIPPET_MAX)}…` : c.text,
			score: c.score,
		})),
	};
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
