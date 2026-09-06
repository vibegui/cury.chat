// Public web chat API. No MCP auth — this is the front door for anyone who
// clicks "falar pela web" on the landing page.
//
// Identity is a random session id the browser keeps in localStorage and sends
// on every call. Whoever holds it can read and write those conversations; a
// share link exposes one conversation read-only to anyone.
//
// Abuse posture: every turn costs an LLM call, so /send is rate limited per
// session and per IP. It is a speed bump, not a wall — the real backstop is the
// AI Gateway spend cap.

import { Hono } from "hono";
import type { Env } from "../env.ts";
import {
	type ConversationMeta,
	createShare,
	deleteConversation,
	listConversations,
	newConversationId,
	resolveShare,
	titleFrom,
	upsertConversation,
	webThreadId,
} from "../pipeline/conversations.ts";
import { loadThread } from "../pipeline/persist.ts";
import { runTurn } from "../pipeline/turn.ts";

export const chatRoute = new Hono<{ Bindings: Env }>();

const MAX_MESSAGE_CHARS = 2000;
const SEND_LIMIT = 20; // messages
const SEND_WINDOW_SECONDS = 60 * 5;

/** Session ids are minted client-side, so treat them as untrusted input. */
function validSessionId(id: unknown): id is string {
	return typeof id === "string" && /^[a-z0-9]{12,64}$/.test(id);
}

function validConversationId(id: unknown): id is string {
	return typeof id === "string" && /^\d{4}-\d{2}-\d{2}-[a-z0-9]{4,12}$/.test(id);
}

/**
 * Fixed-window counter in the DEDUPE namespace (which already has a short TTL
 * habit). Fixed windows allow a burst at the boundary; for a spend guard that
 * is fine and a sliding window is not worth the extra reads.
 */
async function overRateLimit(env: Env, key: string, limit: number): Promise<boolean> {
	const bucket = Math.floor(Date.now() / 1000 / SEND_WINDOW_SECONDS);
	const k = `rl:${key}:${bucket}`;
	const current = Number((await env.DEDUPE.get(k)) ?? 0);
	if (current >= limit) return true;
	await env.DEDUPE.put(k, String(current + 1), { expirationTtl: SEND_WINDOW_SECONDS * 2 });
	return false;
}

function publicTurns(turns: Awaited<ReturnType<typeof loadThread>>) {
	return turns.map((t) => ({
		role: t.role,
		content: t.content,
		ts: t.ts,
		citations: (t.citations ?? []).map((c) =>
			typeof c === "string" ? { source: c } : { source: c.source },
		),
	}));
}

// ---- Conversations ----------------------------------------------------------

chatRoute.get("/conversations", async (c) => {
	const sessionId = c.req.query("session");
	if (!validSessionId(sessionId)) return c.json({ error: "bad session" }, 400);
	return c.json({ conversations: await listConversations(c.env, sessionId) });
});

chatRoute.get("/conversations/:id", async (c) => {
	const sessionId = c.req.query("session");
	const id = c.req.param("id");
	if (!validSessionId(sessionId) || !validConversationId(id)) {
		return c.json({ error: "bad request" }, 400);
	}
	const turns = await loadThread(c.env, webThreadId(sessionId, id));
	const meta = (await listConversations(c.env, sessionId)).find((x) => x.id === id);
	return c.json({ id, meta: meta ?? null, turns: publicTurns(turns) });
});

chatRoute.delete("/conversations/:id", async (c) => {
	const sessionId = c.req.query("session");
	const id = c.req.param("id");
	if (!validSessionId(sessionId) || !validConversationId(id)) {
		return c.json({ error: "bad request" }, 400);
	}
	await deleteConversation(c.env, sessionId, id);
	return c.json({ ok: true });
});

// ---- Send -------------------------------------------------------------------

interface SendBody {
	session?: string;
	conversationId?: string;
	text?: string;
}

chatRoute.post("/send", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as SendBody;
	const sessionId = body.session;
	const text = body.text?.trim();

	if (!validSessionId(sessionId)) return c.json({ error: "bad session" }, 400);
	if (!text) return c.json({ error: "empty message" }, 400);
	if (text.length > MAX_MESSAGE_CHARS) {
		return c.json({ error: `message over ${MAX_MESSAGE_CHARS} characters` }, 413);
	}

	const ip = c.req.header("cf-connecting-ip") ?? "unknown";
	if (
		(await overRateLimit(c.env, `s:${sessionId}`, SEND_LIMIT)) ||
		(await overRateLimit(c.env, `i:${ip}`, SEND_LIMIT * 3))
	) {
		return c.json({ error: "Muitas mensagens em pouco tempo. Espere alguns minutos." }, 429);
	}

	// An unknown or malformed conversation id starts a new conversation rather
	// than erroring: the person typed a message and deserves an answer.
	const conversationId = validConversationId(body.conversationId)
		? body.conversationId
		: newConversationId();
	const threadId = webThreadId(sessionId, conversationId);

	const existing = await listConversations(c.env, sessionId);
	const isNew = !existing.some((x) => x.id === conversationId);

	let result: Awaited<ReturnType<typeof runTurn>>;
	try {
		result = await runTurn(c.env, {
			threadId,
			text,
			metadata: { source: "web", session: sessionId },
		});
	} catch (err) {
		console.error("web chat turn failed", err);
		return c.json({ error: "Tive um problema técnico. Tente de novo em instantes." }, 502);
	}

	const meta: ConversationMeta = await upsertConversation(c.env, sessionId, conversationId, {
		title: isNew ? titleFrom(text) : undefined,
	});

	return c.json({
		conversationId,
		meta,
		reply: result.reply,
		citations: result.citations.map((x) => ({ source: x.source, score: x.score })),
		model: result.model,
	});
});

// ---- Sharing ----------------------------------------------------------------

chatRoute.post("/conversations/:id/share", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { session?: string };
	const id = c.req.param("id");
	if (!validSessionId(body.session) || !validConversationId(id)) {
		return c.json({ error: "bad request" }, 400);
	}

	const list = await listConversations(c.env, body.session);
	const meta = list.find((x) => x.id === id);
	if (!meta) return c.json({ error: "not found" }, 404);

	// One stable share id per conversation: re-sharing hands back the same link
	// instead of scattering copies that each freeze at a different moment.
	const shareId =
		meta.shareId ?? (await createShare(c.env, webThreadId(body.session, id), meta.title));
	if (!meta.shareId) {
		await upsertConversation(c.env, body.session, id, { shareId });
	}
	return c.json({ shareId });
});

/**
 * Read-only, no session required — this is the whole point of a share link.
 * It reads the live thread, so the owner's later messages appear here too.
 */
chatRoute.get("/shared/:shareId", async (c) => {
	const ref = await resolveShare(c.env, c.req.param("shareId"));
	if (!ref) return c.json({ error: "not found" }, 404);
	const turns = await loadThread(c.env, ref.threadId);
	return c.json({ title: ref.title, createdAt: ref.createdAt, turns: publicTurns(turns) });
});
