// Subset of the Meta Cloud API webhook payload we care about.
// Source: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface WebhookPayload {
	object?: string;
	entry?: WebhookEntry[];
	// Subscription verify echo
	hub?: { mode?: string; challenge?: string; verify_token?: string };
}

export interface WebhookEntry {
	id?: string;
	changes?: WebhookChange[];
}

export interface WebhookChange {
	field?: string;
	value?: {
		messaging_product?: "whatsapp";
		metadata?: { display_phone_number?: string; phone_number_id?: string };
		contacts?: WhatsAppContact[];
		messages?: WhatsAppMessage[];
		statuses?: unknown[];
	};
}

export interface WhatsAppContact {
	wa_id?: string;
	profile?: { name?: string };
}

export interface WhatsAppMessage {
	id: string;
	from: string;
	timestamp?: string;
	type:
		| "text"
		| "image"
		| "audio"
		| "video"
		| "document"
		| "sticker"
		| "location"
		| "contacts"
		| "interactive"
		| "reaction"
		| "button"
		| "system";

	text?: { body: string };
	image?: { id: string; mime_type: string; sha256: string; caption?: string };
	audio?: { id: string; mime_type: string; sha256: string; voice?: boolean };
	video?: { id: string; mime_type: string; sha256: string; caption?: string };
	document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
	sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean };
	location?: { latitude: number; longitude: number; name?: string; address?: string };
	contacts?: Array<{ name: { formatted_name: string }; phones?: Array<{ phone: string }> }>;
	interactive?: {
		type: "button_reply" | "list_reply";
		button_reply?: { id: string; title: string };
		list_reply?: { id: string; title: string; description?: string };
	};
	reaction?: { message_id: string; emoji: string };
	button?: { text: string; payload: string };
	context?: { from?: string; id?: string };
}
