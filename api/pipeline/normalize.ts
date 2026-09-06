// Collapse a webhook message of any type into a normalized shape the pipeline can reason about.
//
// v1 implements text + sticker + interactive (button clicks). Media (image/audio/video/document)
// returns a "[media of type X received]" placeholder so the bot acknowledges receipt without
// failing. Full media handling (Whisper transcription, vision input) is a Phase-5 follow-up.

import type { WhatsAppMessage } from "../types/whatsapp.ts";

export interface NormalizedMessage {
	id: string;
	from: string;
	content: string;
	// Set when a future phase wires in Whisper / vision.
	attachments?: Array<{ name: string; contentType: string; url: string }>;
	audioBase64?: string;
	audioContentType?: string;
}

export function normalize(message: WhatsAppMessage): NormalizedMessage {
	const base = { id: message.id, from: message.from };

	switch (message.type) {
		case "text":
			return { ...base, content: message.text?.body ?? "" };

		case "interactive": {
			const i = message.interactive;
			if (i?.type === "button_reply" && i.button_reply) {
				return { ...base, content: `[Button: ${i.button_reply.title}]` };
			}
			if (i?.type === "list_reply" && i.list_reply) {
				return { ...base, content: `[List: ${i.list_reply.title}]` };
			}
			return { ...base, content: "[Interactive message]" };
		}

		case "button":
			return { ...base, content: message.button?.text ?? "[Button]" };

		case "reaction":
			return {
				...base,
				content: `[Reaction: ${message.reaction?.emoji ?? "?"}]`,
			};

		case "location": {
			const l = message.location;
			if (!l) return { ...base, content: "[Location]" };
			return {
				...base,
				content: `[Location: ${l.latitude}, ${l.longitude}${l.name ? ` (${l.name})` : ""}]`,
			};
		}

		case "sticker":
			return { ...base, content: "[Sticker]" };

		case "image":
		case "video":
		case "audio":
		case "document":
			return {
				...base,
				content: `[${message.type} received — media handling not yet enabled; please describe in words]`,
			};

		default:
			return { ...base, content: `[${message.type} message]` };
	}
}
