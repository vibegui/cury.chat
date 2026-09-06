// Full inbound message hot path. Runs inside ctx.waitUntil after the webhook
// responds 200 to Meta. Errors are logged but never thrown — Meta would just
// retry, and the dedupe layer would suppress the retry.

import { loadSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { dateStampFor } from "../lib/thread-id.ts";
import { MetaApi } from "../services/meta.ts";
import type { WhatsAppMessage } from "../types/whatsapp.ts";
import { generate } from "./generate.ts";
import { foldPreviousDay, formatMemoryBlock, loadMemory, saveMemory } from "./memory.ts";
import { normalize } from "./normalize.ts";
import { appendTurns, loadThread, upsertContact } from "./persist.ts";
import { retrieve } from "./retrieve.ts";
import { sendReply } from "./send.ts";

export interface InboundContext {
	message: WhatsAppMessage;
	recipientName?: string;
	phoneNumberId: string;
}

export async function handleInbound(env: Env, ctx: InboundContext): Promise<void> {
	const started = Date.now();
	const { message, recipientName, phoneNumberId } = ctx;

	if (!env.META_ACCESS_TOKEN) {
		console.error("META_ACCESS_TOKEN not set — cannot reply.");
		return;
	}

	const meta = new MetaApi({
		phoneNumberId,
		accessToken: env.META_ACCESS_TOKEN,
		apiVersion: env.META_API_VERSION,
	});

	// Best-effort "read" indicator + typing animation. Failure here is harmless.
	meta.markMessageAsRead(message.id).catch(() => {});

	try {
		const normalized = normalize(message);
		if (!normalized.content.trim()) {
			console.warn("Empty content after normalize; nothing to reply.", message.type);
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
				phoneNumberId,
			},
		});

		await sendReply(meta, normalized.from, result.text);

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
			await meta.sendTextMessage(
				message.from,
				"Desculpe, tive um problema técnico processando sua mensagem. Tente novamente em instantes.",
			);
		} catch (sendErr) {
			console.error("fallback send failed", sendErr);
		}
	}
}
