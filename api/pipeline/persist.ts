// Conversation thread storage in KV.
//
// One key per ${from}:${YYYY-MM-DD}, value = JSON array of turns. Threads roll
// over daily (matches the original waba bridge's behavior). 30-day TTL so old
// conversations don't accumulate forever.
//
// Contact registry: phone → { name, lastSeen } is stored under `c:<phone>`
// in the same THREADS namespace. We refresh it on every inbound message so
// list_threads / get_thread can attribute conversations to a human name.

import type { Env } from "../env.ts";

const TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_TURNS = 30; // hard cap to keep KV reads/writes cheap
const CONTACT_TTL_SECONDS = 60 * 60 * 24 * 365; // contacts persist longer than individual day threads

// A retrieved passage the bot used to ground a reply. We persist the snippet
// text (truncated) alongside the source so the UI/export can show *what* was
// cited, not just which book. Older turns stored bare source strings, so
// readers must handle both shapes.
export interface CitationRef {
	source: string; // book title (already prettified)
	text?: string; // the retrieved passage (truncated)
	score?: number; // vector match score (0-1)
}

export interface Turn {
	role: "user" | "assistant";
	content: string;
	ts: number;
	model?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		// OpenRouter (and some other providers) include cost in USD on the usage
		// object. Optional everywhere — never assume it's there.
		cost?: number;
	};
	// New turns store CitationRef objects; legacy turns stored plain source strings.
	citations?: Array<string | CitationRef>;
	// Set on the first turn from a user; mirrored from Meta's profile.name.
	name?: string;
}

// Normalizers so consumers can treat the mixed legacy/new shape uniformly.
export function citationSource(c: string | CitationRef): string {
	return typeof c === "string" ? c : c.source;
}
export function citationText(c: string | CitationRef): string | undefined {
	return typeof c === "string" ? undefined : c.text;
}

export interface Contact {
	phone: string;
	name?: string;
	lastSeen: number;
}

export async function loadThread(env: Env, threadId: string): Promise<Turn[]> {
	const raw = await env.THREADS.get(`t:${threadId}`);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as Turn[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export async function appendTurns(env: Env, threadId: string, turns: Turn[]): Promise<void> {
	const existing = await loadThread(env, threadId);
	const next = [...existing, ...turns].slice(-MAX_TURNS);
	await env.THREADS.put(`t:${threadId}`, JSON.stringify(next), {
		expirationTtl: TTL_SECONDS,
	});
}

export async function listThreadKeys(env: Env, limit = 100, cursor?: string) {
	const list = await env.THREADS.list({ prefix: "t:", limit, cursor });
	return {
		threads: list.keys.map((k) => k.name.slice(2)),
		cursor: list.list_complete ? undefined : list.cursor,
	};
}

// -----------------------------------------------------------------------------
// Contact registry
// -----------------------------------------------------------------------------

export async function getContact(env: Env, phone: string): Promise<Contact | null> {
	const raw = await env.THREADS.get(`c:${phone}`);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Contact;
		return parsed?.phone ? parsed : null;
	} catch {
		return null;
	}
}

export async function upsertContact(env: Env, phone: string, name?: string): Promise<void> {
	const existing = await getContact(env, phone);
	const next: Contact = {
		phone,
		name: name ?? existing?.name,
		lastSeen: Date.now(),
	};
	await env.THREADS.put(`c:${phone}`, JSON.stringify(next), {
		expirationTtl: CONTACT_TTL_SECONDS,
	});
}

/**
 * Fetch contact records for a batch of phone numbers in parallel. Missing
 * contacts are simply absent from the returned map.
 */
export async function getContactsMany(env: Env, phones: string[]): Promise<Map<string, Contact>> {
	const unique = [...new Set(phones)];
	const results = await Promise.all(unique.map((p) => getContact(env, p)));
	const out = new Map<string, Contact>();
	for (let i = 0; i < unique.length; i++) {
		const c = results[i];
		if (c) out.set(unique[i], c);
	}
	return out;
}
