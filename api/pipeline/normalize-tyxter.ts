// Collapse a Tyxter `message.received` envelope into the same NormalizedMessage
// the Meta path produces, so everything downstream stays transport-agnostic.
//
// Shape (https://tyxter.com/docs/ai/docs/webhooks):
//   { type: "message.received", payload: { data: { message_id, sender,
//     recipient, metadata, content: { type, text|media|interactive|… } } } }
//
// Tyxter normalizes template quick-reply taps into the same `interactive`
// block as standalone interactive replies, so there is deliberately no branch
// on where a button came from.

import type { NormalizedMessage } from "./normalize.ts";

export interface TyxterIdentity {
	type: string;
	id: string;
}

export interface TyxterInboundContent {
	type: "text" | "media" | "interactive" | "flow" | "unsupported" | "unknown";
	text?: { body?: string };
	media?: {
		kind?: string;
		asset_id?: string;
		mime_type?: string;
		filename?: string;
		caption?: string;
		voice?: boolean;
		status?: string;
	};
	interactive?: {
		type?: string;
		button_reply?: { id?: string; title?: string };
		list_reply?: { id?: string; title?: string };
	};
	unsupported?: { provider_type?: string | null };
	unknown?: { provider_type?: string | null };
}

export interface TyxterInboundData {
	message_id: string;
	sender: TyxterIdentity;
	recipient: TyxterIdentity;
	metadata?: Record<string, unknown>;
	content: TyxterInboundContent;
}

export interface TyxterWebhookEnvelope {
	type: string;
	trace_id?: string;
	data?: TyxterInboundData;
}

export function isInboundMessageEvent(
	envelope: TyxterWebhookEnvelope | undefined,
): envelope is TyxterWebhookEnvelope & { data: TyxterInboundData } {
	return !!envelope && envelope.type === "message.received" && !!envelope.data?.sender;
}

/**
 * Garante E.164 com `+`.
 *
 * A doc promete "strict E.164 with a leading +", mas o `sender.id` do webhook
 * chega sem ele. Medido contra a API: enviar para `+5521988447814` é aceito e
 * para `5521988447814` responde `service_window_required` — a Tyxter trata os
 * dois como identidades diferentes, então a janela de 24h aberta pela pessoa
 * não vale para a resposta. O bot respondia para alguém que, do ponto de vista
 * do provedor, nunca tinha falado com ele.
 *
 * Também mantém o id de thread estável: sem isto, a mesma pessoa poderia
 * ganhar duas conversas conforme o formato variasse.
 */
export function toE164(id: string): string {
	const trimmed = id.trim();
	if (!trimmed || trimmed.startsWith("+")) return trimmed;
	return /^\d{8,15}$/.test(trimmed) ? `+${trimmed}` : trimmed;
}

export function normalizeTyxter(data: TyxterInboundData): NormalizedMessage {
	const base = { id: data.message_id, from: toE164(data.sender.id) };
	const content = data.content;

	switch (content?.type) {
		case "text":
			return { ...base, content: content.text?.body ?? "" };

		case "interactive": {
			const i = content.interactive;
			if (i?.button_reply) return { ...base, content: `[Button: ${i.button_reply.title ?? ""}]` };
			if (i?.list_reply) return { ...base, content: `[List: ${i.list_reply.title ?? ""}]` };
			return { ...base, content: "[Interactive message]" };
		}

		case "media": {
			const m = content.media;
			// A caption is the person's actual words — prefer it over a placeholder.
			if (m?.caption?.trim()) return { ...base, content: m.caption };
			const kind = m?.voice ? "voice note" : (m?.kind ?? "media");
			return { ...base, content: `[${kind} recebido]` };
		}

		case "flow":
			return { ...base, content: "[Flow response]" };

		// Provider refused to deliver the bytes (video notes, polls, some
		// view-once). They never arrive and never will — asking for a resend in
		// the same format would loop the person forever.
		case "unsupported":
			return { ...base, content: "[Formato não suportado pelo WhatsApp]" };

		// Delivered fine, just not projected into a typed field yet (location,
		// contact card, order). The content exists; we only lack the typed view.
		case "unknown":
			return { ...base, content: `[Mensagem de tipo ${content.unknown?.provider_type ?? "?"}]` };

		default:
			return { ...base, content: "" };
	}
}
