// Verify Tyxter webhook signatures.
//
// Every delivery carries three headers:
//   tyxter-webhook-id         envelope id — also our dedupe key
//   tyxter-webhook-timestamp  unix seconds
//   tyxter-webhook-signature  hex HMAC-SHA256 over `${timestamp}.${rawBody}`
//
// Docs: https://tyxter.com/docs/ai/docs/webhooks
//   "Verify HMAC-SHA256 over timestamp.rawBody using the endpoint signing
//    secret. Reject missing headers, timestamps outside a five minute
//    tolerance, and signatures that fail constant-time comparison. Always
//    verify against the raw request body, not parsed and re-stringified JSON."
//
// The secret is per-endpoint, not per-URL: one receiver URL reused across
// environments or projects gets a different secret per registration, so a
// receiver serving several must select by endpoint id, not by path.

const encoder = new TextEncoder();

const TOLERANCE_SECONDS = 5 * 60;

export interface TyxterSignatureHeaders {
	id: string | null;
	timestamp: string | null;
	signature: string | null;
}

export type TyxterVerifyResult =
	| { ok: true }
	| { ok: false; reason: "no_secret" | "missing_headers" | "stale_timestamp" | "bad_signature" };

export function readTyxterSignatureHeaders(h: Headers): TyxterSignatureHeaders {
	return {
		id: h.get("tyxter-webhook-id"),
		timestamp: h.get("tyxter-webhook-timestamp"),
		signature: h.get("tyxter-webhook-signature"),
	};
}

export async function verifyTyxterSignature(
	rawBody: string,
	headers: TyxterSignatureHeaders,
	signingSecret: string | undefined,
	nowMs: number = Date.now(),
): Promise<TyxterVerifyResult> {
	// Unlike the Meta path, a missing secret is NOT waved through. Tyxter hands
	// the secret over at endpoint creation, so not having it means the endpoint
	// was never registered — accepting unsigned posts there would leave the
	// pipeline open to anyone who guesses the URL.
	if (!signingSecret) return { ok: false, reason: "no_secret" };

	const { timestamp, signature } = headers;
	if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };

	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) return { ok: false, reason: "missing_headers" };
	if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) {
		return { ok: false, reason: "stale_timestamp" };
	}

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(signingSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));

	// Tolerate an algorithm prefix (`sha256=…`) if Tyxter ever adds one, and
	// compare case-insensitively — hex casing is not part of the secret.
	const provided = signature.includes("=")
		? signature.slice(signature.indexOf("=") + 1)
		: signature;
	if (!timingSafeEqual(bufferToHex(mac), provided.trim().toLowerCase())) {
		return { ok: false, reason: "bad_signature" };
	}
	return { ok: true };
}

function bufferToHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, "0");
	}
	return out;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
