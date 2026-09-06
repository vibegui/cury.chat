// Cloudflare Worker entrypoint.
//
// Routes:
//   GET  /                — readiness ping
//   GET  /webhook         — Meta verification handshake
//   POST /webhook         — Meta inbound message (direct Cloud API)
//   POST /tyxter/webhook  — Tyxter inbound message (brokered WhatsApp)
//   /api/chat/*           — public web chat (no auth; rate limited)
//   GET  /chat, /s/:id    — the web chat UI
//
// All bindings + secrets are defined in wrangler.toml and api/env.ts.

import { Hono } from "hono";
// Built by `bun run build:chat` and inlined to one file, then imported as text
// via wrangler.toml's [[rules]] type="Text" rule. Same trick as the MCP app.
import chatBundle from "../dist/chat/chat.html";
import type { Env } from "./env.ts";
import { requireMcpAuth } from "./lib/auth.ts";
import { chatRoute } from "./routes/chat.ts";
import { mcpRoute } from "./routes/mcp.ts";
import { testRoute } from "./routes/test.ts";
import { tyxterWebhookRoute } from "./routes/tyxter-webhook.ts";
import { webhookRoute } from "./routes/webhook.ts";

// Same cast as api/mcp/resources.ts: @types/bun types `*.html` as HTMLBundle,
// but wrangler's Text rule hands the Worker a plain string.
const chatHtml: string = chatBundle as unknown as string;

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

// Public web chat API. Deliberately outside the MCP_AUTH_TOKEN gate — it is the
// front door for anyone who clicks "falar pela web". Rate limits live in the
// route itself.
app.route("/api/chat", chatRoute);

// The chat UI itself. `/s/:shareId` serves the same bundle — the app reads the
// path and renders the read-only view, so a share link is one round trip.
for (const path of ["/chat", "/s/:shareId"]) {
	app.get(path, (c) =>
		c.html(chatHtml, 200, {
			// Shared conversations are public but not worth indexing, and the
			// bundle changes on every deploy.
			"cache-control": "public, max-age=0, must-revalidate",
			"x-robots-tag": "noindex",
		}),
	);
}

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
