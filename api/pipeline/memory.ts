// Cross-day conversation memory.
//
// Threads roll over daily (see thread-id.ts), so without this the agent forgets
// every prior day. We keep a lean, per-user rolling log of dated daily summaries
// under `m:<phone>` in the THREADS namespace (365-day TTL, same lifetime as the
// contact registry).
//
// The fold runs at most once per user per active day: on the first message of a
// new day, we cheaply LLM-summarize the *previous* active day's thread and append
// it to the log. The log is then injected into the system prompt as a <memory>
// block so the agent can continue long-running conversations.

import { chat } from "../ai/gateway.ts";
import type { Env } from "../env.ts";
import { loadThread, type Turn } from "./persist.ts";

const TTL_SECONDS = 60 * 60 * 24 * 365;
const MAX_ENTRIES = 60; // cap injected context; ~one paragraph per active day

export interface MemoryEntry {
	date: string; // YYYY-MM-DD of the day being summarized
	summary: string;
}

export interface UserMemory {
	phone: string;
	entries: MemoryEntry[];
	// Last UTC day (YYYY-MM-DD) on which this user was active. Used as the pointer
	// for what still needs folding — no KV key enumeration required.
	lastActiveDate?: string;
}

export async function loadMemory(env: Env, phone: string): Promise<UserMemory> {
	const raw = await env.THREADS.get(`m:${phone}`);
	if (!raw) return { phone, entries: [] };
	try {
		const parsed = JSON.parse(raw) as UserMemory;
		return {
			phone,
			entries: Array.isArray(parsed.entries) ? parsed.entries : [],
			lastActiveDate: parsed.lastActiveDate,
		};
	} catch {
		return { phone, entries: [] };
	}
}

export async function saveMemory(env: Env, phone: string, mem: UserMemory): Promise<void> {
	const trimmed: UserMemory = {
		phone,
		entries: mem.entries.slice(-MAX_ENTRIES),
		lastActiveDate: mem.lastActiveDate,
	};
	await env.THREADS.put(`m:${phone}`, JSON.stringify(trimmed), {
		expirationTtl: TTL_SECONDS,
	});
}

export function formatMemoryBlock(mem: UserMemory): string {
	if (mem.entries.length === 0) return "";
	const lines = mem.entries.map((e) => `[${e.date}] ${e.summary}`);
	return [
		"<memory>",
		"Resumo de conversas anteriores com este interlocutor (mais antigo primeiro). Use-o para dar continuidade ao diálogo, sem repetir o que já foi dito:",
		"",
		lines.join("\n"),
		"</memory>",
	].join("\n");
}

/**
 * If the user's previous active day hasn't been folded into memory yet, summarize
 * that day's thread and append a dated entry. Always advances `lastActiveDate` to
 * `today`. Returns the (possibly updated) memory. Never throws — a failed summary
 * just skips the entry so the hot path keeps working.
 */
export async function foldPreviousDay(
	env: Env,
	phone: string,
	today: string,
	mem: UserMemory,
): Promise<UserMemory> {
	const prevDate = mem.lastActiveDate;

	// Only work to do when the last active day is a real, earlier day we haven't
	// already captured. Same-day repeat messages short-circuit here.
	if (prevDate && prevDate < today && !mem.entries.some((e) => e.date === prevDate)) {
		try {
			const prevThread = await loadThread(env, `${phone}:${prevDate}`);
			const summary = await summarizeThread(env, phone, prevThread);
			if (summary) mem.entries.push({ date: prevDate, summary });
		} catch (err) {
			console.warn("memory fold failed", { phone, prevDate, err });
		}
	}

	mem.lastActiveDate = today;
	return mem;
}

async function summarizeThread(env: Env, phone: string, thread: Turn[]): Promise<string | null> {
	if (thread.length === 0) return null;

	const transcript = thread
		.map((t) => `${t.role === "user" ? "Pessoa" : "Cury"}: ${t.content}`)
		.join("\n");

	const result = await chat(
		env,
		[
			{
				role: "system",
				content:
					"Você resume conversas de WhatsApp entre o agente Cury Chat e uma pessoa. " +
					"Resuma em 2 a 4 frases, em português: os temas discutidos, o contexto e os interesses da pessoa, " +
					"e qualquer assunto que tenha ficado em aberto. Escreva apenas o resumo, sem preâmbulo.",
			},
			{ role: "user", content: transcript },
		],
		{
			temperature: 0.3,
			maxTokens: 300,
			metadata: { kind: "memory-summary", phone },
		},
	);

	const text = result.text.trim();
	return text || null;
}
