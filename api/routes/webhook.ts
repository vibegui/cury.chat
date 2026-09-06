// /webhook GET + POST.
//
//   GET  — Meta subscription verification handshake. Echo hub.challenge if the
//          hub.verify_token matches our META_VERIFY_TOKEN.
//   POST — Meta inbound message webhook. We:
//            1. verify the X-Hub-Signature-256 HMAC,
//            2. dedupe on message.id (Meta retries aggressively),
//            3. respond 200 immediately and process in waitUntil() — Meta
//               times webhook handlers out at ~20 s.

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { verifyMetaSignature } from "../lib/signature.ts";
import { alreadyProcessed, markProcessed } from "../pipeline/dedupe.ts";
import { handleInbound } from "../pipeline/index.ts";
import type { WebhookPayload } from "../types/whatsapp.ts";

interface Variables {
	rawBody: string;
}

export const webhookRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

webhookRoute.get("/", (c) => {
	const mode = c.req.query("hub.mode");
	const token = c.req.query("hub.verify_token");
	const challenge = c.req.query("hub.challenge");

	if (mode === "subscribe" && token && token === c.env.META_VERIFY_TOKEN) {
		return c.text(challenge ?? "", 200);
	}
	return c.text("forbidden", 403);
});

webhookRoute.post("/", async (c) => {
	const raw = await c.req.text();
	const signature = c.req.header("x-hub-signature-256");

	const ok = await verifyMetaSignature(raw, signature ?? null, c.env.META_APP_SECRET);
	if (!ok) {
		console.warn("Rejected webhook: bad signature");
		return c.text("invalid signature", 401);
	}

	let payload: WebhookPayload;
	try {
		payload = JSON.parse(raw) as WebhookPayload;
	} catch {
		return c.text("bad json", 400);
	}

	const change = payload.entry?.[0]?.changes?.[0];
	const value = change?.value;
	const message = value?.messages?.[0];
	const phoneNumberId = value?.metadata?.phone_number_id;
	const recipientName = value?.contacts?.[0]?.profile?.name;

	// Status-only callbacks (delivered/read receipts) — ack and ignore.
	if (!message || !phoneNumberId) {
		return c.text("ok", 200);
	}

	if (await alreadyProcessed(c.env, message.id)) {
		console.log("dedupe hit", message.id);
		return c.text("ok", 200);
	}
	await markProcessed(c.env, message.id);

	// Ack Meta immediately, then process in background. waitUntil keeps the
	// Worker alive past the response.
	c.executionCtx.waitUntil(handleInbound(c.env, { message, recipientName, phoneNumberId }));

	return c.text("ok", 200);
});
