// Pure-function tests for the lib/ helpers.
// Run with `bun test`.

import { describe, expect, test } from "bun:test";
import { extractToken, timingSafeEqual } from "../api/lib/auth.ts";
import { verifyMetaSignature } from "../api/lib/signature.ts";
import { threadIdFor } from "../api/lib/thread-id.ts";

// -----------------------------------------------------------------------------
// threadIdFor
// -----------------------------------------------------------------------------

describe("threadIdFor", () => {
	test("formats as <phone>:<YYYY-MM-DD> in UTC", () => {
		const d = new Date("2026-05-28T13:45:00Z");
		expect(threadIdFor("5511999999999", d)).toBe("5511999999999:2026-05-28");
	});

	test("pads single-digit month and day", () => {
		const d = new Date("2026-01-03T00:00:00Z");
		expect(threadIdFor("5511", d)).toBe("5511:2026-01-03");
	});

	test("uses UTC, not local time — rolls over at UTC midnight", () => {
		// 2026-05-28 23:59:59 UTC → still 05-28
		// 2026-05-29 00:00:00 UTC → 05-29
		expect(threadIdFor("x", new Date("2026-05-28T23:59:59Z"))).toBe("x:2026-05-28");
		expect(threadIdFor("x", new Date("2026-05-29T00:00:00Z"))).toBe("x:2026-05-29");
	});
});

// -----------------------------------------------------------------------------
// verifyMetaSignature
// -----------------------------------------------------------------------------

describe("verifyMetaSignature", () => {
	// Pre-computed: openssl dgst -sha256 -hmac "secret" of "hello world".
	const body = "hello world";
	const secret = "secret";
	const goodSig = "sha256=734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a";

	test("returns true when signature matches", async () => {
		expect(await verifyMetaSignature(body, goodSig, secret)).toBe(true);
	});

	test("returns false on mismatched signature", async () => {
		const bad = "sha256=0000000000000000000000000000000000000000000000000000000000000000";
		expect(await verifyMetaSignature(body, bad, secret)).toBe(false);
	});

	test("returns false on missing signature header", async () => {
		expect(await verifyMetaSignature(body, null, secret)).toBe(false);
	});

	test("returns false on header missing sha256= prefix", async () => {
		const raw = goodSig.slice("sha256=".length);
		expect(await verifyMetaSignature(body, raw, secret)).toBe(false);
	});

	test("dev mode: returns true if secret is undefined", async () => {
		// This is the documented escape hatch for setups where the App Secret
		// isn't accessible. Encoded in lib/signature.ts.
		expect(await verifyMetaSignature(body, null, undefined)).toBe(true);
		expect(await verifyMetaSignature(body, "anything", undefined)).toBe(true);
	});

	test("different secret → different signature → false", async () => {
		expect(await verifyMetaSignature(body, goodSig, "different-secret")).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// extractToken — header precedence
// -----------------------------------------------------------------------------

function fakeCtx(opts: { auth?: string; xMcpAuth?: string; queryToken?: string }) {
	const headers = new Map<string, string | undefined>();
	if (opts.auth !== undefined) headers.set("authorization", opts.auth);
	if (opts.xMcpAuth !== undefined) headers.set("x-mcp-auth", opts.xMcpAuth);
	return {
		req: {
			header: (name: string) => headers.get(name.toLowerCase()),
			query: (name: string) => (name === "token" ? opts.queryToken : undefined),
		},
	} as any;
}

describe("extractToken", () => {
	test("returns null when no token anywhere", () => {
		expect(extractToken(fakeCtx({}))).toBeNull();
	});

	test("reads Authorization: Bearer <token>", () => {
		expect(extractToken(fakeCtx({ auth: "Bearer abc123" }))).toBe("abc123");
	});

	test("trims whitespace around bearer token", () => {
		expect(extractToken(fakeCtx({ auth: "Bearer   abc123  " }))).toBe("abc123");
	});

	test("ignores non-bearer Authorization schemes", () => {
		expect(extractToken(fakeCtx({ auth: "Basic dXNlcjpwYXNz" }))).toBeNull();
	});

	test("reads x-mcp-auth header", () => {
		expect(extractToken(fakeCtx({ xMcpAuth: "xyz789" }))).toBe("xyz789");
	});

	test("reads ?token= query param", () => {
		expect(extractToken(fakeCtx({ queryToken: "querytoken" }))).toBe("querytoken");
	});

	test("Authorization wins over x-mcp-auth", () => {
		expect(extractToken(fakeCtx({ auth: "Bearer fromAuth", xMcpAuth: "fromHeader" }))).toBe(
			"fromAuth",
		);
	});

	test("x-mcp-auth wins over query param", () => {
		expect(extractToken(fakeCtx({ xMcpAuth: "fromHeader", queryToken: "fromQuery" }))).toBe(
			"fromHeader",
		);
	});
});

describe("timingSafeEqual", () => {
	test("equal strings → true", () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
	});

	test("different strings same length → false", () => {
		expect(timingSafeEqual("abc", "abd")).toBe(false);
	});

	test("different lengths → false (does not throw)", () => {
		expect(timingSafeEqual("abc", "abcd")).toBe(false);
		expect(timingSafeEqual("", "x")).toBe(false);
	});

	test("empty strings → true", () => {
		expect(timingSafeEqual("", "")).toBe(true);
	});
});
