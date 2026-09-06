// Full inbound message hot path. Runs inside ctx.waitUntil after the webhook
// has already acknowledged the provider. Errors are logged but never thrown —
// the provider would just retry, and the dedupe layer would suppress it.
//
// Transport-agnostic on purpose: the route hands in an already-normalized
// message and something that can send. Meta direct and Tyxter each build their
// own; nothing below this line knows which one is on the wire.

import { loadSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { dateStampFor } from "../lib/thread-id.ts";
import { generate } from "./generate.ts";
import { foldPreviousDay, formatMemoryBlock, loadMemory, saveMemory } from "./memory.ts";
import type { NormalizedMessage } from "./normalize.ts";
import { appendTurns, loadThread, upsertContact } from "./persist.ts";
import { retrieve } from "./retrieve.ts";
import { sendReply } from "./send.ts";

export interface Transport {
	sendText(to: string, body: string): Promise<unknown>;
	markRead(messageId: string): Promise<unknown>;
}

export interface InboundContext {
	transport: Transport;
	normalized: NormalizedMessage;
	recipientName?: string;
	/** Business-side identifier, for AI Gateway metadata only. */
	senderId: string;
}

export async function handleInbound(env: Env, ctx: InboundContext): Promise<void> {
	const started = Date.now();
	const { transport, normalized, recipientName, senderId } = ctx;

	// Best-effort read receipt + typing indicator. Failure here is harmless.
	transport.markRead(normalized.id).catch(() => {});

	try {
		if (!normalized.content.trim()) {
			console.warn("Empty content after normalize; nothing to reply.");
			return;
		}

		const today = dateStampFor();
		const threadId = `${normalized.from}:${today}`;
		const [thread, systemPrompt, loadedMemory] = await Promise.all([
			loadThread(env, threadId),
			loadSystemPrompt(env),
			loadMemory(env, normalized.from),
			upsertContact(env, normalized.from, recipientName),
		]);

		// On the first message of a new day, fold the previous active day's thread
		// into the rolling memory log so it's available as context for this turn.
		const memory = await foldPreviousDay(env, normalized.from, today, loadedMemory);
		await saveMemory(env, normalized.from, memory);

		const citations = await retrieve(env, normalized.content).catch((err) => {
			console.warn("retrieve failed", err);
			return [];
		});

		const result = await generate(env, {
			systemPrompt,
			thread,
			userMessage: normalized.content,
			citations,
			recipientName,
			memory: formatMemoryBlock(memory),
			metadata: {
				phone: normalized.from,
				threadId,
				phoneNumberId: senderId,
			},
		});

		// Persistir antes de enviar. Na ordem inversa, uma falha de envio levava o
		// turno junto: foi assim que seis mensagens sumiram sem deixar registro,
		// e o que sobrou para diagnosticar foi só a telemetria.
		await appendTurns(env, threadId, [
			{
				role: "user",
				content: normalized.content,
				ts: Date.now(),
				name: recipientName,
			},
			{
				role: "assistant",
				content: result.text,
				ts: Date.now(),
				model: result.model,
				usage: result.usage,
				citations: result.citationsUsed,
			},
		]);

		await sendReply(transport, normalized.from, result.text);

		console.log("turn ok", {
			threadId,
			ms: Date.now() - started,
			model: result.model,
			tokens: result.usage?.total_tokens,
			citations: result.citationsUsed.length,
		});
	} catch (err) {
		console.error("pipeline error", err);
		try {
			await transport.sendText(
				normalized.from,
				"Desculpe, tive um problema técnico processando sua mensagem. Tente novamente em instantes.",
			);
		} catch (sendErr) {
			console.error("fallback send failed", sendErr);
		}
	}
}
