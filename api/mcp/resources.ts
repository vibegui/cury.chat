// MCP resources exposed by this worker. Each one is a UI bundle that deco
// studio loads into a sandboxed iframe to render alongside / instead of
// raw tool output.
//
// All seven resources currently serve the SAME bundled HTML
// (dist/web/index.html). The React app inside picks the right view at
// runtime by inspecting hostContext.toolInfo.tool.name — same pattern as
// the canonical mcp-app template.
//
// To add a new resource: drop a new line in RESOURCE_URIS, and (if it's
// tied to a tool) set _meta.ui.resourceUri on the tool in mcp/tools.ts.

// Wrangler types this import as `HTMLBundle` by default. The [[rules]]
// type="Text" rule in wrangler.toml downgrades it to a raw string at build
// time, so the runtime value is the HTML body — we cast accordingly.
import bundledHtml from "../../dist/web/index.html";

const HTML: string = bundledHtml as unknown as string;

export const MCP_APP_MIME = "text/html;profile=mcp-app";

export interface ResourceDef {
	uri: string;
	name: string;
	description: string;
}

// The seven UI surfaces. Tool ↔ URI mapping lives in mcp/tools.ts.
export const RESOURCES: ResourceDef[] = [
	{
		uri: "ui://cury/threads-list",
		name: "Threads",
		description: "List of recent WhatsApp conversation threads.",
	},
	{
		uri: "ui://cury/thread-detail",
		name: "Thread detail",
		description: "Full transcript of a conversation with per-turn metadata.",
	},
	{
		uri: "ui://cury/system-prompt",
		name: "System prompt",
		description: "Inspect and live-edit the bot's system prompt.",
	},
	{
		uri: "ui://cury/send-text",
		name: "Send message",
		description: "Compose and send a WhatsApp message from the bot.",
	},
	{
		uri: "ui://cury/corpus",
		name: "Corpus",
		description: "Browse the knowledge base indexed by AutoRAG.",
	},
	{
		uri: "ui://cury/status",
		name: "Status",
		description: "Compact runtime health and config view.",
	},
	{
		// export_threads_html sempre apontou para este recurso, mas ele nunca foi
		// declarado — a view existia em web/ e o studio não tinha o que abrir.
		uri: "ui://cury/export-result",
		name: "Export",
		description: "Result of an HTML conversation export.",
	},
	{
		uri: "ui://cury/analytics",
		name: "Analytics",
		description: "Usage by state, topic and channel.",
	},
	{
		uri: "ui://cury/admin",
		name: "Admin",
		description: "Main admin canvas — status, activity, costs, quick actions.",
	},
];

const RESOURCE_INDEX: Record<string, ResourceDef> = Object.fromEntries(
	RESOURCES.map((r) => [r.uri, r]),
);

export function findResource(uri: string): ResourceDef | undefined {
	return RESOURCE_INDEX[uri];
}

/**
 * Returns the HTML body for any of our `ui://cury/*` URIs.
 * Every URI maps to the same single-file bundle — the React app routes
 * internally based on hostContext.toolInfo.tool.name.
 */
export function readResourceBody(uri: string): string | null {
	if (!RESOURCE_INDEX[uri]) return null;
	return HTML;
}
