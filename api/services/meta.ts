// Meta WhatsApp Cloud API client.
//
// Ported from deco-sites/waba/services/meta.ts but stripped of the deco-cx
// `createHttpClient` abstraction — uses plain fetch so it has zero deco
// dependencies. Drop this file into any Worker / Node project as-is.
//
// Docs:
//   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media

export interface MessageResponse {
	messaging_product?: string;
	contacts?: Array<{ input: string; wa_id: string }>;
	messages?: Array<{ id: string; message_status?: string }>;
	error?: { message: string; type: string; code: number };
}

export interface MediaInfoResponse {
	messaging_product: string;
	url: string;
	mime_type: string;
	sha256: string;
	file_size: number;
	id: string;
}

export interface MetaApiOptions {
	phoneNumberId: string;
	accessToken: string;
	apiVersion?: string; // defaults to v23.0
}

type TemplateHeaderParam =
	| {
			type: "text" | "image" | "video" | "document";
			text?: string;
			parameter_name?: string;
			image?: { id?: string; link?: string };
			video?: { id?: string; link?: string };
			document?: { id?: string; link?: string; filename?: string };
	  }
	| {
			type: "location";
			location: {
				latitude: string;
				longitude: string;
				name?: string;
				address?: string;
			};
	  };

type TemplateBodyParam = {
	type: "text" | "currency" | "date_time";
	text?: string;
	currency?: { fallback_value: string; code: string; amount_1000: number };
	date_time?: { fallback_value: string };
	parameter_name?: string;
};

type TemplateButtonParam = {
	type: "button";
	sub_type: "quick_reply" | "url";
	index: string;
	parameters: Array<{
		type: "payload" | "text";
		payload?: string;
		text?: string;
	}>;
};

export interface TemplateOptions {
	headerParameters?: TemplateHeaderParam[];
	bodyParameters?: TemplateBodyParam[];
	buttonParameters?: TemplateButtonParam[];
}

export class MetaApi {
	private readonly phoneNumberId: string;
	private readonly accessToken: string;
	private readonly base: string;

	constructor(opts: MetaApiOptions) {
		this.phoneNumberId = opts.phoneNumberId;
		this.accessToken = opts.accessToken;
		this.base = `https://graph.facebook.com/${opts.apiVersion ?? "v23.0"}`;
	}

	private async post(path: string, body: unknown): Promise<Response> {
		return fetch(`${this.base}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
	}

	private async postForm(path: string, body: FormData): Promise<Response> {
		return fetch(`${this.base}${path}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${this.accessToken}` },
			body,
		});
	}

	private async get(path: string): Promise<Response> {
		return fetch(`${this.base}${path}`, {
			method: "GET",
			headers: { Authorization: `Bearer ${this.accessToken}` },
		});
	}

	async sendTextMessage(to: string, text: string): Promise<MessageResponse> {
		const res = await this.post(`/${this.phoneNumberId}/messages`, {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to,
			type: "text",
			text: { body: text },
		});
		const json = (await res.json()) as MessageResponse;
		if (!res.ok) throw new Error(`Meta sendText ${res.status}: ${JSON.stringify(json)}`);
		return json;
	}

	async sendImageMessage(to: string, mediaId: string, caption?: string): Promise<MessageResponse> {
		const res = await this.post(`/${this.phoneNumberId}/messages`, {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to,
			type: "image",
			image: { id: mediaId, ...(caption ? { caption } : {}) },
		});
		const json = (await res.json()) as MessageResponse;
		if (!res.ok) throw new Error(`Meta sendImage ${res.status}: ${JSON.stringify(json)}`);
		return json;
	}

	async sendTemplateMessage(
		to: string,
		templateName: string,
		languageCode: string,
		options?: TemplateOptions,
	): Promise<MessageResponse> {
		const components: unknown[] = [];

		if (options?.headerParameters?.length) {
			const headerParam = options.headerParameters[0];
			if (headerParam.type === "location") {
				components.push({
					type: "header",
					parameters: [{ type: "location", location: headerParam.location }],
				});
			} else {
				components.push({
					type: "header",
					parameters: options.headerParameters.map((p) => {
						if (p.type === "text") {
							return {
								type: "text",
								text: p.text || "",
								...(p.parameter_name ? { parameter_name: p.parameter_name } : {}),
							};
						}
						return p;
					}),
				});
			}
		}

		if (options?.bodyParameters?.length) {
			components.push({
				type: "body",
				parameters: options.bodyParameters.map((p) => {
					if (p.type === "text") {
						return {
							type: "text",
							text: p.text || "",
							...(p.parameter_name ? { parameter_name: p.parameter_name } : {}),
						};
					}
					return p;
				}),
			});
		}

		if (options?.buttonParameters?.length) {
			for (const b of options.buttonParameters) {
				components.push({
					type: "button",
					sub_type: b.sub_type,
					index: b.index,
					parameters: b.parameters,
				});
			}
		}

		const res = await this.post(`/${this.phoneNumberId}/messages`, {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to,
			type: "template",
			template: {
				name: templateName,
				language: { code: languageCode },
				...(components.length > 0 ? { components } : {}),
			},
		});
		const json = (await res.json()) as MessageResponse;
		if (!res.ok) throw new Error(`Meta sendTemplate ${res.status}: ${JSON.stringify(json)}`);
		return json;
	}

	async markMessageAsRead(messageId: string): Promise<void> {
		// Best-effort: failures here should never block the response path.
		try {
			await this.post(`/${this.phoneNumberId}/messages`, {
				messaging_product: "whatsapp",
				status: "read",
				message_id: messageId,
				typing_indicator: { type: "text" },
			});
		} catch {
			// swallow
		}
	}

	async uploadMedia(file: Blob, type: string, filename = "upload.bin"): Promise<{ id: string }> {
		const form = new FormData();
		form.append("messaging_product", "whatsapp");
		form.append("type", type);
		form.append("file", file, filename);
		const res = await this.postForm(`/${this.phoneNumberId}/media`, form);
		if (!res.ok) throw new Error(`Meta uploadMedia ${res.status}: ${await res.text()}`);
		return (await res.json()) as { id: string };
	}

	async retrieveMediaUrl(mediaId: string): Promise<MediaInfoResponse> {
		const res = await this.get(`/${mediaId}`);
		if (!res.ok) throw new Error(`Meta retrieveMedia ${res.status}: ${await res.text()}`);
		return (await res.json()) as MediaInfoResponse;
	}

	async downloadMedia(mediaUrl: string): Promise<{ data: ArrayBuffer; contentType: string }> {
		const res = await fetch(mediaUrl, {
			headers: { Authorization: `Bearer ${this.accessToken}` },
		});
		if (!res.ok) throw new Error(`Meta downloadMedia ${res.status} ${res.statusText}`);
		return {
			data: await res.arrayBuffer(),
			contentType: res.headers.get("content-type") ?? "application/octet-stream",
		};
	}

	async downloadMediaById(
		mediaId: string,
	): Promise<{ data: ArrayBuffer; contentType: string; mediaInfo: MediaInfoResponse }> {
		const mediaInfo = await this.retrieveMediaUrl(mediaId);
		const dl = await this.downloadMedia(mediaInfo.url);
		return { ...dl, mediaInfo };
	}
}
