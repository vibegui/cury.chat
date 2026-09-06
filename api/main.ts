// Cloudflare Worker entrypoint.
//
// Routes:
//   GET  /                — the landing page
//   GET  /chat, /s/:id    — the web chat UI
//   GET  /health          — readiness ping (JSON)
//   GET  /webhook         — Meta verification handshake
//   POST /webhook         — Meta inbound message (direct Cloud API)
//   POST /tyxter/webhook  — Tyxter inbound message (brokered WhatsApp)
//   /api/chat/*           — public web chat (no auth; rate limited)
//
// The Worker serves the whole product from one origin. A separate Pages
// deploy for the landing would mean a second hostname, CORS on the chat API,
// and a cross-origin CTA — for one static file.
//
// All bindings + secrets are defined in wrangler.toml and api/env.ts.

import { Hono } from "hono";
// Built by `bun run build:chat` and inlined to one file, then imported as text
// via wrangler.toml's [[rules]] type="Text" rule. Same trick as the MCP app.
import chatBundle from "../dist/chat/chat.html";
import appleIcon from "../landing/apple-touch-icon.png";
import favicon32 from "../landing/favicon-32.png";
import icon192 from "../landing/icon-192.png";
import icon512 from "../landing/icon-512.png";
import iconSvg from "../landing/icon.svg";
import landingBundle from "../landing/index.html";
import ogImage from "../landing/og.png";
import landingLlms from "../landing/llms.txt";
import landingRobots from "../landing/robots.txt";
import type { Env } from "./env.ts";
import { requireMcpAuth } from "./lib/auth.ts";
import { CACHE_PAGE, CACHE_TEXT, serveStatic, staticAsset } from "./lib/static-asset.ts";
import { chatRoute } from "./routes/chat.ts";
import { mcpRoute } from "./routes/mcp.ts";
import { testRoute } from "./routes/test.ts";
import { tyxterWebhookRoute } from "./routes/tyxter-webhook.ts";
import { webhookRoute } from "./routes/webhook.ts";

// Same cast as api/mcp/resources.ts: @types/bun types `*.html` as HTMLBundle,
// but wrangler's Text rule hands the Worker a plain string.
const chatHtml: string = chatBundle as unknown as string;
const landingHtml: string = landingBundle as unknown as string;

const app = new Hono<{ Bindings: Env }>();

/*
 * Force HTTPS. Cloudflare's "Always Use HTTPS" zone setting does the same job,
 * but keeping it here means the guarantee travels with the code instead of
 * living in a dashboard nobody re-checks. Without it `window.location.origin`
 * is `http://…` and the chat hands out insecure share links.
 */
app.use("*", async (c, next) => {
	const url = new URL(c.req.url);
	if (url.protocol === "http:") {
		url.protocol = "https:";
		return c.redirect(url.toString(), 301);
	}
	await next();
	if (!c.res.headers.has("strict-transport-security")) {
		c.res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
	}
});

const LANDING = staticAsset(landingHtml, "text/html; charset=utf-8", CACHE_PAGE);
app.get("/", (c) => serveStatic(LANDING, c.req.header("if-none-match")));

const TEXT_ASSETS: Record<string, { body: string; type: string }> = {
	"/robots.txt": { body: landingRobots as unknown as string, type: "text/plain; charset=utf-8" },
	"/llms.txt": { body: landingLlms as unknown as string, type: "text/plain; charset=utf-8" },
	// Generated rather than read from a file: esbuild has no .xml loader, and a
	// one-URL sitemap is not worth a build plugin. /chat and /s/:id are noindex,
	// so the landing is the only entry.
	"/sitemap.xml": {
		body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://cury.chat/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>`,
		type: "application/xml",
	},
};
for (const [path, { body, type }] of Object.entries(TEXT_ASSETS)) {
	const built = staticAsset(body, type, CACHE_TEXT);
	app.get(path, (c) => serveStatic(built, c.req.header("if-none-match")));
}

/*
 * Brand assets. Immutable in practice — the content only changes when
 * `bun run brand` regenerates them, and a stale favicon is a cosmetic problem
 * for a day, not a correctness one. Long max-age, no revalidation.
 */
const BINARY_ASSETS: Record<string, { body: ArrayBuffer; type: string }> = {
	"/og.png": { body: ogImage as unknown as ArrayBuffer, type: "image/png" },
	"/favicon.ico": { body: favicon32 as unknown as ArrayBuffer, type: "image/png" },
	"/favicon-32.png": { body: favicon32 as unknown as ArrayBuffer, type: "image/png" },
	"/apple-touch-icon.png": { body: appleIcon as unknown as ArrayBuffer, type: "image/png" },
	"/icon-192.png": { body: icon192 as unknown as ArrayBuffer, type: "image/png" },
	"/icon-512.png": { body: icon512 as unknown as ArrayBuffer, type: "image/png" },
};
for (const [path, { body, type }] of Object.entries(BINARY_ASSETS)) {
	app.get(
		path,
		() =>
			new Response(body, {
				headers: { "content-type": type, "cache-control": "public, max-age=604800" },
			}),
	);
}
app.get("/icon.svg", (c) =>
	serveStatic(
		staticAsset(iconSvg as unknown as string, "image/svg+xml", "public, max-age=604800"),
		c.req.header("if-none-match"),
	),
);

// Was `/`. Kept as JSON on its own path so the root can serve the landing —
// deploy scripts and uptime checks point here.
app.get("/health", (c) =>
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
// Both routes serve the same bundle; the app reads the path at runtime. Only
// the shell is cached — the conversation itself comes from /api/chat, which
// never is.
const CHAT_SHELL = staticAsset(chatHtml, "text/html; charset=utf-8", CACHE_PAGE);
for (const path of ["/chat", "/s/:shareId"]) {
	app.get(path, (c) => {
		const res = serveStatic(CHAT_SHELL, c.req.header("if-none-match"));
		res.headers.set("x-robots-tag", "noindex");
		return res;
	});
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
