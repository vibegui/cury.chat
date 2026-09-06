// Web-chat conversation index and share links, in the THREADS namespace.
//
// The web has no phone number, so a browser identifies itself with a random
// session id it keeps in localStorage. That is the whole auth model: whoever
// holds the id can read and write those conversations. It is a public,
// anonymous chat — there is nothing to steal but the person's own messages,
// and asking a voter to create an account to ask about a candidate's proposals
// would cost far more than it protects.
//
// Keys (all in THREADS):
//   t:web_<session>:<convId>   turns — same `t:` prefix as WhatsApp, so the
//                              existing MCP dashboard lists web conversations
//                              with no extra code
//   wc:<session>               that session's conversation index
//   sh:<shareId>               share link → threadId
//
// ponytail: session id in localStorage, no accounts. Add real auth only if
// conversations ever need to survive a browser change or carry private data.

import type { Env } from "../env.ts";

const CONV_TTL_SECONDS = 60 * 60 * 24 * 30; // matches the thread TTL
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365;
const MAX_CONVERSATIONS = 50;
const TITLE_MAX = 60;

export interface ConversationMeta {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	/** Set once shared; the same conversation keeps one stable share id. */
	shareId?: string;
}

export interface SharedRef {
	threadId: string;
	title: string;
	createdAt: number;
}

/** `web_<session>` doubles as the "phone" column in the MCP dashboard. */
export function webThreadId(sessionId: string, conversationId: string): string {
	return `web_${sessionId}:${conversationId}`;
}

export function isWebThread(threadId: string): boolean {
	return threadId.startsWith("web_");
}

/**
 * Date-prefixed so the id sorts chronologically and reads sensibly in the
 * dashboard's `date` column, which splits the thread id on `:`.
 */
export function newConversationId(now: Date = new Date()): string {
	const day = now.toISOString().slice(0, 10);
	return `${day}-${randomSlug(6)}`;
}

export function randomSlug(len: number): string {
	// No l/1/0/O — these ids get read aloud and typed by hand.
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(len));
	let out = "";
	for (const b of bytes) out += alphabet[b % alphabet.length];
	return out;
}

/** First user message, trimmed to one line — same convention as every chat UI. */
export function titleFrom(text: string): string {
	const line = text.replace(/\s+/g, " ").trim();
	if (!line) return "Nova conversa";
	return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

// -----------------------------------------------------------------------------
// Conversation index
// -----------------------------------------------------------------------------

export async function listConversations(env: Env, sessionId: string): Promise<ConversationMeta[]> {
	const raw = await env.THREADS.get(`wc:${sessionId}`);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as ConversationMeta[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

async function saveConversations(
	env: Env,
	sessionId: string,
	list: ConversationMeta[],
): Promise<void> {
	const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
	await env.THREADS.put(`wc:${sessionId}`, JSON.stringify(trimmed), {
		expirationTtl: CONV_TTL_SECONDS,
	});
}

export async function upsertConversation(
	env: Env,
	sessionId: string,
	id: string,
	patch: Partial<ConversationMeta>,
): Promise<ConversationMeta> {
	const list = await listConversations(env, sessionId);
	const existing = list.find((c) => c.id === id);
	const now = Date.now();
	const next: ConversationMeta = {
		id,
		title: patch.title ?? existing?.title ?? "Nova conversa",
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		shareId: patch.shareId ?? existing?.shareId,
	};
	await saveConversations(env, sessionId, [next, ...list.filter((c) => c.id !== id)]);
	return next;
}

export async function deleteConversation(env: Env, sessionId: string, id: string): Promise<void> {
	const list = await listConversations(env, sessionId);
	await saveConversations(
		env,
		sessionId,
		list.filter((c) => c.id !== id),
	);
	await env.THREADS.delete(`t:${webThreadId(sessionId, id)}`);
	// The share link is deliberately left alive: someone may already be reading
	// it, and it resolves against a thread that is now gone, which the share
	// route renders as an empty conversation rather than a 404 lie.
}

// -----------------------------------------------------------------------------
// Share links
// -----------------------------------------------------------------------------

export async function createShare(env: Env, threadId: string, title: string): Promise<string> {
	const shareId = randomSlug(10);
	const ref: SharedRef = { threadId, title, createdAt: Date.now() };
	await env.THREADS.put(`sh:${shareId}`, JSON.stringify(ref), {
		expirationTtl: SHARE_TTL_SECONDS,
	});
	return shareId;
}

export async function resolveShare(env: Env, shareId: string): Promise<SharedRef | null> {
	const raw = await env.THREADS.get(`sh:${shareId}`);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as SharedRef;
		return parsed?.threadId ? parsed : null;
	} catch {
		return null;
	}
}
