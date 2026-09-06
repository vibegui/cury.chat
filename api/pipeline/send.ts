// Send a possibly-long LLM response back to WhatsApp.
//
// WhatsApp's hard text message limit is 4096 characters but readability drops
// long before that. We split on paragraph boundaries when the response is over
// ~1500 chars, falling back to hard-character splits if a single paragraph is
// itself huge.

import type { MetaApi } from "../services/meta.ts";

const SOFT_LIMIT = 1500;
const HARD_LIMIT = 3800;

export async function sendReply(meta: MetaApi, to: string, text: string): Promise<void> {
	const trimmed = text.trim();
	if (!trimmed) return;

	const chunks = chunkForWhatsApp(trimmed);
	for (const chunk of chunks) {
		await meta.sendTextMessage(to, chunk);
	}
}

export function chunkForWhatsApp(text: string): string[] {
	if (text.length <= SOFT_LIMIT) return [text];

	const paragraphs = text.split(/\n\n+/);
	const chunks: string[] = [];
	let buf = "";

	for (const p of paragraphs) {
		if (p.length > HARD_LIMIT) {
			if (buf) {
				chunks.push(buf);
				buf = "";
			}
			for (let i = 0; i < p.length; i += HARD_LIMIT) {
				chunks.push(p.slice(i, i + HARD_LIMIT));
			}
			continue;
		}
		if (buf && buf.length + p.length + 2 > SOFT_LIMIT) {
			chunks.push(buf);
			buf = p;
		} else {
			buf = buf ? `${buf}\n\n${p}` : p;
		}
	}
	if (buf) chunks.push(buf);
	return chunks;
}
