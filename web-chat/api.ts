// Thin client over /api/chat. Same origin as the worker that serves this page,
// so there is no base URL and no CORS.

export interface Turn {
	role: "user" | "assistant";
	content: string;
	ts: number;
	citations?: { source: string }[];
}

export interface ConversationMeta {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	shareId?: string;
}

const SESSION_KEY = "cury.chat.session";

/**
 * The browser's whole identity. Anonymous by design: asking someone to make an
 * account before they can ask what a candidate proposes would lose more people
 * than it protects.
 */
export function sessionId(): string {
	let id = localStorage.getItem(SESSION_KEY);
	if (!id || !/^[a-z0-9]{12,64}$/.test(id)) {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		id = [...bytes]
			.map((b) => b.toString(36).padStart(2, "0"))
			.join("")
			.slice(0, 24);
		localStorage.setItem(SESSION_KEY, id);
	}
	return id;
}

async function json<T>(res: Response): Promise<T> {
	const body = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
	return body;
}

export async function listConversations(): Promise<ConversationMeta[]> {
	const res = await fetch(`/api/chat/conversations?session=${sessionId()}`);
	return (await json<{ conversations: ConversationMeta[] }>(res)).conversations;
}

export async function loadConversation(
	id: string,
): Promise<{ meta: ConversationMeta | null; turns: Turn[] }> {
	const res = await fetch(`/api/chat/conversations/${id}?session=${sessionId()}`);
	return json(res);
}

export async function deleteConversation(id: string): Promise<void> {
	await fetch(`/api/chat/conversations/${id}?session=${sessionId()}`, { method: "DELETE" });
}

export async function send(
	text: string,
	conversationId?: string,
): Promise<{
	conversationId: string;
	meta: ConversationMeta;
	reply: string;
	citations: { source: string }[];
}> {
	const res = await fetch("/api/chat/send", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ session: sessionId(), conversationId, text }),
	});
	return json(res);
}

export interface StreamHandlers {
	onMeta: (conversationId: string, meta: ConversationMeta) => void;
	onDelta: (text: string) => void;
	onDone: (citations: { source: string }[]) => void;
}

/**
 * SSE over fetch rather than EventSource: EventSource is GET-only and cannot
 * send a JSON body or headers, so it would mean putting the whole message in a
 * query string.
 */
export async function sendStreaming(
	text: string,
	conversationId: string | undefined,
	handlers: StreamHandlers,
	signal?: AbortSignal,
): Promise<void> {
	const res = await fetch("/api/chat/stream", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ session: sessionId(), conversationId, text }),
		signal,
	});

	if (!res.ok || !res.body) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error || `HTTP ${res.status}`);
	}

	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += value;

		// Records are separated by a blank line; anything after the last one is a
		// partial record and stays in the buffer.
		const records = buffer.split("\n\n");
		buffer = records.pop() ?? "";

		for (const record of records) {
			let event = "message";
			let data = "";
			for (const line of record.split("\n")) {
				if (line.startsWith("event:")) event = line.slice(6).trim();
				else if (line.startsWith("data:")) data += line.slice(5).trim();
			}
			if (!data) continue;

			const parsed = JSON.parse(data);
			if (event === "meta") handlers.onMeta(parsed.conversationId, parsed.meta);
			else if (event === "delta") handlers.onDelta(parsed.text);
			else if (event === "done") handlers.onDone(parsed.citations ?? []);
			else if (event === "error") throw new Error(parsed.error);
		}
	}
}

/** Returns the full canonical URL — the server builds it, not the browser. */
export async function share(id: string): Promise<string> {
	const res = await fetch(`/api/chat/conversations/${id}/share`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ session: sessionId() }),
	});
	const body = await json<{ shareId: string; url?: string }>(res);
	return body.url ?? `${window.location.origin}/s/${body.shareId}`;
}

export async function loadShared(shareId: string): Promise<{ title: string; turns: Turn[] }> {
	return json(await fetch(`/api/chat/shared/${shareId}`));
}
