// POST /tyxter/webhook — inbound WhatsApp messages brokered by Tyxter.
//
// Contract Tyxter imposes on this handler (https://tyxter.com/docs/ai/docs/webhooks):
//   - Answer 2xx DIRECTLY. Tyxter never follows redirects; any 3xx counts as a
//     failed attempt.
//   - One fixed 10-second deadline per attempt, covering DNS, request and
//     reading our response body. So: ack first, work in waitUntil.
//   - Delivery is at-least-once with no ordering guarantee. Dedupe on the
//     envelope id (tyxter-webhook-id).
//   - 20 consecutive failures auto-disable the endpoint; recovering it takes a
//     PATCH back to status active. Cheap to avoid, expensive to hit.
//
// A rejected signature answers 401, which Tyxter records as a failed attempt.
// That is the intended behaviour: a receiver silently 200-ing unverified posts
// is worse than an endpoint that trips its breaker loudly.

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { readTyxterSignatureHeaders, verifyTyxterSignature } from "../lib/tyxter-signature.ts";
import { recordTurn } from "../pipeline/analytics.ts";
import { alreadyProcessed, markProcessed } from "../pipeline/dedupe.ts";
import { handleInbound, type Transport } from "../pipeline/index.ts";
import {
	isInboundMessageEvent,
	normalizeTyxter,
	type TyxterWebhookEnvelope,
} from "../pipeline/normalize-tyxter.ts";
import { TyxterApi } from "../services/tyxter.ts";

export const tyxterWebhookRoute = new Hono<{ Bindings: Env }>();

tyxterWebhookRoute.post("/", async (c) => {
	// Raw text, never a re-serialized parse — the HMAC covers the exact bytes.
	const raw = await c.req.text();
	const headers = readTyxterSignatureHeaders(c.req.raw.headers);

	const verified = await verifyTyxterSignature(raw, headers, c.env.TYXTER_WEBHOOK_SIGNING_SECRET);
	if (!verified.ok) {
		console.warn("Rejected Tyxter webhook", { reason: verified.reason, id: headers.id });
		return c.text(verified.reason, 401);
	}

	let envelope: TyxterWebhookEnvelope;
	try {
		envelope = JSON.parse(raw) as TyxterWebhookEnvelope;
	} catch {
		return c.text("bad json", 400);
	}

	// webhook.test probes and delivery-status events land here too. Ack them.
	if (!isInboundMessageEvent(envelope)) {
		console.log("tyxter event ignored", { type: envelope.type, id: headers.id });
		return c.text("ok", 200);
	}

	// Dedupe on the envelope id rather than the message id: a resend of the same
	// event carries the same envelope id, and that is exactly what must not be
	// processed twice.
	const dedupeKey = headers.id ?? envelope.data.message_id;
	if (await alreadyProcessed(c.env, dedupeKey)) {
		console.log("dedupe hit", dedupeKey);
		return c.text("ok", 200);
	}
	await markProcessed(c.env, dedupeKey);

	// Meta may withhold the sender on a production inbound message, which Tyxter
	// surfaces as an explicit empty id. It is not a usable recipient, so there is
	// nobody to reply to.
	const normalized = normalizeTyxter(envelope.data);
	if (!normalized.from) {
		console.warn("Inbound with unresolved sender — cannot reply.", dedupeKey);
		return c.text("ok", 200);
	}

	if (!c.env.TYXTER_API_KEY) {
		console.error("TYXTER_API_KEY not set — cannot reply.");
		return c.text("ok", 200);
	}

	const senderId = c.env.TYXTER_PHONE_NUMBER_ID || envelope.data.recipient?.id || "";
	const tyxter = new TyxterApi({
		apiKey: c.env.TYXTER_API_KEY,
		senderId,
		baseUrl: c.env.TYXTER_API_BASE_URL,
	});
	const transport: Transport = {
		sendText: (to, body) => tyxter.sendText(to, body),
		markRead: (id) => tyxter.markRead(id),
	};

	const recipientName =
		typeof envelope.data.metadata?.name === "string" ? envelope.data.metadata.name : undefined;

	c.executionCtx.waitUntil(
		handleInbound(c.env, { transport, normalized, recipientName, senderId }),
	);
	// O `cf` aqui é da requisição do Tyxter, não de quem escreveu — por isso o
	// estado fica de fora no WhatsApp. Melhor um campo vazio que um errado.
	c.executionCtx.waitUntil(
		recordTurn(c.env, { channel: "whatsapp", text: normalized.content, who: normalized.from }),
	);

	return c.text("ok", 200);
});
