// Cloudflare Worker entrypoint.
//
// Routes:
//   GET  /                — readiness ping
//   GET  /webhook         — Meta verification handshake
//   POST /webhook         — Meta inbound message (direct Cloud API)
//   POST /tyxter/webhook  — Tyxter inbound message (brokered WhatsApp)
//
// All bindings + secrets are defined in wrangler.toml and api/env.ts.

import { Hono } from "hono";
import type { Env } from "./env.ts";
import { requireMcpAuth } from "./lib/auth.ts";
import { mcpRoute } from "./routes/mcp.ts";
import { testRoute } from "./routes/test.ts";
import { tyxterWebhookRoute } from "./routes/tyxter-webhook.ts";
import { webhookRoute } from "./routes/webhook.ts";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
	c.json({
		name: "cury-mcp",
		ok: true,
		model: c.env.LLM_MODEL,
		provider: c.env.LLM_PROVIDER,
		ragEnabled: !!c.env.AUTORAG_INSTANCE,
		transports: {
			meta: !!c.env.META_ACCESS_TOKEN,
			tyxter: !!c.env.TYXTER_API_KEY && !!c.env.TYXTER_WEBHOOK_SIGNING_SECRET,
		},
	}),
);

// Two concrete callers of the same pipeline. Whichever provider posts, its
// route builds its own client and normalizer; handleInbound sees neither.
app.route("/webhook", webhookRoute);
app.route("/tyxter/webhook", tyxterWebhookRoute);

// /mcp and /test are control-plane: require MCP_AUTH_TOKEN.
// Gate is open if the secret is unset (dev mode); the middleware logs a warning.
app.use("/mcp", requireMcpAuth);
app.use("/mcp/*", requireMcpAuth);
app.use("/test", requireMcpAuth);
app.use("/test/*", requireMcpAuth);

app.route("/test", testRoute);
app.route("/mcp", mcpRoute);

app.notFound((c) => c.json({ error: "not found", path: c.req.path }, 404));

app.onError((err, c) => {
	console.error("unhandled", err);
	return c.json({ error: "internal" }, 500);
});

export default app;
