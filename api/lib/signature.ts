// Verify Meta WhatsApp webhook signatures.
// Meta posts `X-Hub-Signature-256: sha256=<hex hmac of raw body using app secret>`.
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests

const encoder = new TextEncoder();

export async function verifyMetaSignature(
	rawBody: string,
	signatureHeader: string | null,
	appSecret: string | undefined,
): Promise<boolean> {
	if (!appSecret) {
		// If you haven't configured META_APP_SECRET, accept (dev mode). Production
		// installs should always set it — the deploy doc calls this out.
		return true;
	}
	if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
		return false;
	}

	const expected = signatureHeader.slice("sha256=".length);

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(appSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
	const got = bufferToHex(sig);

	return timingSafeEqual(got, expected);
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
