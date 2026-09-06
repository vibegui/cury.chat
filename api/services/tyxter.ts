// Tyxter Messaging client — WhatsApp transport.
//
// Tyxter brokers the Meta WhatsApp Business Platform: it owns the WABA
// relationship, we speak plain REST to api.tyxter.com. Docs:
//   https://tyxter.com/docs/ai/docs/api-reference/messages
//
// Environment is chosen by the API key prefix, not by the URL: `tx_sandbox_`
// keys reach the sandbox, `tx_live_` keys reach production. Both use the same
// base URL. A key pointed at the wrong environment answers 401.
//
// Zero dependencies, plain fetch — same posture as services/meta.ts.

export interface TyxterApiOptions {
	apiKey: string;
	/** Tyxter phone number id (`cm…`) or the number in E.164. Both are accepted. */
	senderId: string;
	baseUrl?: string;
}

export interface TyxterMessageAccepted {
	id: string;
	object: string;
	status: string;
}

export interface TyxterPhoneNumber {
	id: string;
	phone: string;
	environment: "sandbox" | "production";
	status: string;
	/** null until the number is registered with Meta through Embedded Signup. */
	meta_phone_number_id: string | null;
	waba_id: string | null;
	display_name: string | null;
	ddd: string;
}

export interface TyxterWebhookEndpoint {
	id: string;
	url: string;
	status: string;
	subscribed_events: string[];
	/** Returned ONCE, on creation and on rotate. Never readable again. */
	signing_secret?: string;
}

export interface TyxterErrorBody {
	error?: {
		type?: string;
		code?: string;
		message?: string;
		param?: string;
		request_id?: string;
		trace_id?: string;
	};
}

/**
 * Carries Tyxter's stable `error.code` so callers can branch on it instead of
 * pattern-matching prose. `service_window_required` and `kyc_required` are the
 * two that legitimately change what the caller should do next.
 */
export class TyxterError extends Error {
	readonly status: number;
	readonly code: string;
	readonly requestId?: string;

	constructor(status: number, body: TyxterErrorBody, fallback: string) {
		const err = body.error;
		super(err?.message ?? fallback);
		this.name = "TyxterError";
		this.status = status;
		this.code = err?.code ?? `http_${status}`;
		this.requestId = err?.request_id;
	}
}

export const DEFAULT_TYXTER_BASE_URL = "https://api.tyxter.com";

export class TyxterApi {
	private readonly apiKey: string;
	private readonly base: string;
	readonly senderId: string;

	constructor(opts: TyxterApiOptions) {
		this.apiKey = opts.apiKey;
		this.senderId = opts.senderId;
		this.base = (opts.baseUrl || DEFAULT_TYXTER_BASE_URL).replace(/\/+$/, "");
	}

	private async request<T>(
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		body?: unknown,
		idempotencyKey?: string,
	): Promise<T> {
		const headers: Record<string, string> = {
			authorization: `Bearer ${this.apiKey}`,
		};
		if (body !== undefined) headers["content-type"] = "application/json";
		if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

		const res = await fetch(`${this.base}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		const text = await res.text();
		let parsed: unknown;
		try {
			parsed = text ? JSON.parse(text) : {};
		} catch {
			parsed = {};
		}

		if (!res.ok) {
			throw new TyxterError(res.status, parsed as TyxterErrorBody, `${method} ${path} failed`);
		}
		return parsed as T;
	}

	// ---- Messages -----------------------------------------------------------

	/**
	 * Free-form text. Only valid inside the 24-hour service window opened by an
	 * inbound customer message — outside it Tyxter answers 400
	 * `service_window_required` and you must send an approved template instead.
	 * A reactive bot is always inside the window, since it only ever replies.
	 */
	async sendText(to: string, body: string): Promise<TyxterMessageAccepted> {
		return this.request<TyxterMessageAccepted>(
			"POST",
			"/v1/messages",
			{
				channel: "whatsapp",
				sender: { type: "whatsapp_phone_number", id: this.senderId },
				recipient: { type: "phone_e164", id: to },
				message: { type: "text", text: { body } },
			},
			crypto.randomUUID(),
		);
	}

	/** Approved template — the only way to open a conversation cold. */
	async sendTemplate(
		to: string,
		name: string,
		language: string,
		variables?: Record<string, string | number | boolean>,
	): Promise<TyxterMessageAccepted> {
		return this.request<TyxterMessageAccepted>(
			"POST",
			"/v1/messages",
			{
				channel: "whatsapp",
				sender: { type: "whatsapp_phone_number", id: this.senderId },
				recipient: { type: "phone_e164", id: to },
				message: {
					type: "template",
					template: { name, language, ...(variables && { variables }) },
				},
			},
			crypto.randomUUID(),
		);
	}

	/**
	 * Marks the inbound message read and shows the typing indicator for up to
	 * 25 seconds — which is roughly one RAG turn, so the person sees activity
	 * instead of silence while we retrieve and generate.
	 */
	async markRead(messageId: string): Promise<void> {
		await this.request("POST", `/v1/messages/${encodeURIComponent(messageId)}/typing`);
	}

	// ---- Phone numbers ------------------------------------------------------

	async listPhoneNumbers(): Promise<TyxterPhoneNumber[]> {
		const res = await this.request<{ data: TyxterPhoneNumber[] }>("GET", "/v1/phone-numbers");
		return res.data ?? [];
	}

	async getPhoneNumber(id: string): Promise<TyxterPhoneNumber> {
		return this.request<TyxterPhoneNumber>("GET", `/v1/phone-numbers/${encodeURIComponent(id)}`);
	}

	// ---- Webhook endpoints --------------------------------------------------

	/** The 201 response carries `signing_secret` exactly once. Store it then. */
	async createWebhookEndpoint(
		url: string,
		subscribedEvents: string[],
		description?: string,
	): Promise<TyxterWebhookEndpoint> {
		return this.request<TyxterWebhookEndpoint>(
			"POST",
			"/v1/webhook-endpoints",
			{ url, subscribed_events: subscribedEvents, ...(description && { description }) },
			crypto.randomUUID(),
		);
	}

	async listWebhookEndpoints(): Promise<TyxterWebhookEndpoint[]> {
		const res = await this.request<{ data: TyxterWebhookEndpoint[] }>(
			"GET",
			"/v1/webhook-endpoints",
		);
		return res.data ?? [];
	}

	/**
	 * One signed probe against a registered endpoint. Terminal after attempt 1 —
	 * no retry either way — and capped at five per minute per endpoint. Returns
	 * a pending receipt; poll GET /v1/webhook-events/{id} for the outcome.
	 */
	async testWebhookEndpoint(id: string): Promise<{ webhook_event_id: string }> {
		return this.request<{ webhook_event_id: string }>(
			"POST",
			`/v1/webhook-endpoints/${encodeURIComponent(id)}/test`,
			{},
			crypto.randomUUID(),
		);
	}
}
