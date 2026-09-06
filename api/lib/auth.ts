// Bearer-token gate for the control-plane endpoints (/mcp, /test).
//
// Studio (and most MCP clients) call /mcp with an Authorization header. We
// accept three vectors so the same secret works from any client:
//   1. Authorization: Bearer <token>           ← canonical
//   2. x-mcp-auth: <token>                     ← custom header
//   3. ?token=<token>  in the URL              ← fallback for clients that
//                                                  only store the URL
//
// Set the secret once:   wrangler secret put MCP_AUTH_TOKEN
//   Generate one with:   openssl rand -hex 32
//
// If MCP_AUTH_TOKEN is unset, the gate is OPEN (matches local dev expectations
// and lets us iterate quickly). The worker logs a warning so you notice.

import type { Context, Next } from "hono";
import type { Env } from "../env.ts";

const BEARER_PREFIX = "Bearer ";

export function extractToken(c: Context): string | null {
	const auth = c.req.header("authorization");
	if (auth?.startsWith(BEARER_PREFIX)) return auth.slice(BEARER_PREFIX.length).trim();
	const custom = c.req.header("x-mcp-auth");
	if (custom) return custom.trim();
	const q = c.req.query("token");
	if (q) return q.trim();
	return null;
}

export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Hono middleware. Mount on any route that needs the token.
 *
 *   app.use("/mcp/*", requireMcpAuth);
 *   app.use("/test/*", requireMcpAuth);
 */
export async function requireMcpAuth(
	c: Context<{ Bindings: Env }>,
	next: Next,
): Promise<Response | void> {
	const expected = c.env.MCP_AUTH_TOKEN;
	if (!expected) {
		// Dev mode — gate is open. Warn so prod misconfig is loud.
		console.warn(
			"MCP_AUTH_TOKEN is not set — control plane is OPEN to the internet. Run `wrangler secret put MCP_AUTH_TOKEN`.",
		);
		return next();
	}

	const got = extractToken(c);
	if (!got || !timingSafeEqual(got, expected)) {
		return c.json(
			{
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32001,
					message:
						"Unauthorized. Provide the MCP token via 'Authorization: Bearer <token>', 'x-mcp-auth' header, or ?token=<token> in the URL.",
				},
			},
			401,
		);
	}

	await next();
}
