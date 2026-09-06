import { describe, expect, test } from "bun:test";
import { readTyxterSignatureHeaders, verifyTyxterSignature } from "../api/lib/tyxter-signature.ts";
import {
	isInboundMessageEvent,
	normalizeTyxter,
	toE164,
	type TyxterInboundData,
} from "../api/pipeline/normalize-tyxter.ts";

const SECRET = "whsec_test_secret";
const BODY = '{"type":"message.received","data":{"message_id":"msg_1"}}';

async function sign(rawBody: string, timestamp: string, secret = SECRET): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// -----------------------------------------------------------------------------
// Signature — HMAC-SHA256 over `${timestamp}.${rawBody}`, 5 minute tolerance
// -----------------------------------------------------------------------------

describe("verifyTyxterSignature", () => {
	const now = 1_800_000_000_000; // fixed clock so the tolerance test is stable
	const ts = String(Math.floor(now / 1000));

	test("accepts a correctly signed body", async () => {
		const headers = { id: "evt_1", timestamp: ts, signature: await sign(BODY, ts) };
		expect(await verifyTyxterSignature(BODY, headers, SECRET, now)).toEqual({ ok: true });
	});

	test("rejects when no signing secret is configured", async () => {
		const headers = { id: "evt_1", timestamp: ts, signature: await sign(BODY, ts) };
		expect(await verifyTyxterSignature(BODY, headers, undefined, now)).toEqual({
			ok: false,
			reason: "no_secret",
		});
	});

	test("rejects a body altered after signing", async () => {
		const headers = { id: "evt_1", timestamp: ts, signature: await sign(BODY, ts) };
		const tampered = BODY.replace("msg_1", "msg_2");
		expect(await verifyTyxterSignature(tampered, headers, SECRET, now)).toEqual({
			ok: false,
			reason: "bad_signature",
		});
	});

	test("rejects a signature made with a different endpoint secret", async () => {
		const headers = { id: "evt_1", timestamp: ts, signature: await sign(BODY, ts, "other") };
		expect(await verifyTyxterSignature(BODY, headers, SECRET, now)).toEqual({
			ok: false,
			reason: "bad_signature",
		});
	});

	test("rejects a replay older than the five minute tolerance", async () => {
		const oldTs = String(Math.floor(now / 1000) - 301);
		const headers = { id: "evt_1", timestamp: oldTs, signature: await sign(BODY, oldTs) };
		expect(await verifyTyxterSignature(BODY, headers, SECRET, now)).toEqual({
			ok: false,
			reason: "stale_timestamp",
		});
	});

	test("accepts a timestamp just inside the tolerance", async () => {
		const edgeTs = String(Math.floor(now / 1000) - 299);
		const headers = { id: "evt_1", timestamp: edgeTs, signature: await sign(BODY, edgeTs) };
		expect(await verifyTyxterSignature(BODY, headers, SECRET, now)).toEqual({ ok: true });
	});

	test("rejects missing or non-numeric headers", async () => {
		const sig = await sign(BODY, ts);
		expect(
			await verifyTyxterSignature(BODY, { id: "e", timestamp: null, signature: sig }, SECRET, now),
		).toEqual({ ok: false, reason: "missing_headers" });
		expect(
			await verifyTyxterSignature(BODY, { id: "e", timestamp: ts, signature: null }, SECRET, now),
		).toEqual({ ok: false, reason: "missing_headers" });
		expect(
			await verifyTyxterSignature(
				BODY,
				{ id: "e", timestamp: "nope", signature: sig },
				SECRET,
				now,
			),
		).toEqual({ ok: false, reason: "missing_headers" });
	});

	test("reads the three delivery headers", () => {
		const h = new Headers({
			"tyxter-webhook-id": "evt_1",
			"tyxter-webhook-timestamp": ts,
			"tyxter-webhook-signature": "abc",
		});
		expect(readTyxterSignatureHeaders(h)).toEqual({
			id: "evt_1",
			timestamp: ts,
			signature: "abc",
		});
	});
});

// -----------------------------------------------------------------------------
// Inbound normalization
// -----------------------------------------------------------------------------

function inbound(content: TyxterInboundData["content"]): TyxterInboundData {
	return {
		message_id: "msg_01HZ6",
		sender: { type: "phone_e164", id: "+5511988887777" },
		recipient: { type: "whatsapp_phone_number", id: "cmtpq24z5005g01pqssaix42d" },
		content,
	};
}

describe("normalizeTyxter", () => {
	test("text", () => {
		expect(normalizeTyxter(inbound({ type: "text", text: { body: "olá" } }))).toEqual({
			id: "msg_01HZ6",
			from: "+5511988887777",
			content: "olá",
		});
	});

	test("button reply — same shape whether it came from a template or not", () => {
		const out = normalizeTyxter(
			inbound({
				type: "interactive",
				interactive: { type: "button_reply", button_reply: { id: "plan:pro", title: "Pro" } },
			}),
		);
		expect(out.content).toBe("[Button: Pro]");
	});

	test("list reply", () => {
		const out = normalizeTyxter(
			inbound({
				type: "interactive",
				interactive: { type: "list_reply", list_reply: { id: "edu", title: "Educação" } },
			}),
		);
		expect(out.content).toBe("[List: Educação]");
	});

	test("media caption wins over the placeholder — it is what the person wrote", () => {
		const out = normalizeTyxter(
			inbound({ type: "media", media: { kind: "image", caption: "isso é verdade?" } }),
		);
		expect(out.content).toBe("isso é verdade?");
	});

	test("captionless media falls back to a placeholder", () => {
		expect(normalizeTyxter(inbound({ type: "media", media: { kind: "image" } })).content).toBe(
			"[image recebido]",
		);
		expect(
			normalizeTyxter(inbound({ type: "media", media: { kind: "audio", voice: true } })).content,
		).toBe("[voice note recebido]");
	});

	test("unsupported and unknown each render their own block", () => {
		expect(
			normalizeTyxter(
				inbound({ type: "unsupported", unsupported: { provider_type: "video_note" } }),
			).content,
		).toBe("[Formato não suportado pelo WhatsApp]");
		expect(
			normalizeTyxter(inbound({ type: "unknown", unknown: { provider_type: "location" } })).content,
		).toBe("[Mensagem de tipo location]");
	});

	test("withheld sender surfaces as an empty id, never a synthetic one", () => {
		const data = inbound({ type: "text", text: { body: "oi" } });
		data.sender = { type: "phone_e164", id: "" };
		expect(normalizeTyxter(data).from).toBe("");
	});
});

describe("isInboundMessageEvent", () => {
	test("accepts message.received", () => {
		expect(
			isInboundMessageEvent({
				type: "message.received",
				data: inbound({ type: "text", text: { body: "oi" } }),
			}),
		).toBe(true);
	});

	test("rejects the webhook.test probe and delivery events", () => {
		expect(isInboundMessageEvent({ type: "webhook.test" })).toBe(false);
		expect(isInboundMessageEvent({ type: "message.failed" })).toBe(false);
		expect(isInboundMessageEvent(undefined)).toBe(false);
	});
});

describe("toE164", () => {
	test("prefixa o + que o webhook não manda", () => {
		// Medido contra a API: sem o +, a Tyxter não reconhece a janela de 24h e
		// devolve service_window_required. Foi o que deixou o bot mudo.
		expect(toE164("5521988447814")).toBe("+5521988447814");
	});

	test("não duplica quando já vem certo", () => {
		expect(toE164("+5521988447814")).toBe("+5521988447814");
	});

	test("deixa em paz o que não é telefone", () => {
		// O remetente pode vir vazio quando o Meta oculta a identidade, e ids
		// opacos de sandbox não são números.
		expect(toE164("")).toBe("");
		expect(toE164("mock_phone_abc")).toBe("mock_phone_abc");
	});

	test("normalizeTyxter aplica em quem escreveu", () => {
		const out = normalizeTyxter({
			message_id: "msg_1",
			sender: { type: "phone_e164", id: "5521988447814" },
			recipient: { type: "whatsapp_phone_number", id: "pn_1" },
			content: { type: "text", text: { body: "oi" } },
		});
		expect(out.from).toBe("+5521988447814");
	});
});
