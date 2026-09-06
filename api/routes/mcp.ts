// Minimal MCP (Model Context Protocol) JSON-RPC handler.
//
// Implements just enough of MCP 2024-11-05 to register with deco studio as an
// external MCP App. Methods supported:
//   initialize         → server identity + capabilities
//   tools/list         → returns the tool catalog from mcp/tools.ts
//   tools/call         → executes a tool, returns JSON content
//   resources/list     → returns the UI resource catalog from mcp/resources.ts
//   resources/read     → returns the bundled HTML for a ui://cury/* URI
//   ping               → keepalive
//
// JSON-RPC 2.0 over POST /mcp. No SSE / streaming yet — request/response only.
// That's all studio needs to discover tools, fetch UI bundles, and call tools.
//
// Spec: https://modelcontextprotocol.io/specification/2024-11-05

import { Hono } from "hono";
import type { Env } from "../env.ts";
import { findResource, MCP_APP_MIME, readResourceBody, RESOURCES } from "../mcp/resources.ts";
import { toolByName, tools } from "../mcp/tools.ts";

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: number | string | null;
	method: string;
	params?: any;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

const SERVER_INFO = {
	name: "cury-mcp",
	version: "0.1.0",
};

const PROTOCOL_VERSION = "2024-11-05";

export const mcpRoute = new Hono<{ Bindings: Env }>();

mcpRoute.get("/", (c) =>
	c.json({
		jsonrpc: "2.0",
		server: SERVER_INFO,
		hint: "POST JSON-RPC 2.0 requests here. Methods: initialize, tools/list, tools/call, ping.",
	}),
);

mcpRoute.post("/", async (c) => {
	const body = (await c.req.json().catch(() => null)) as JsonRpcRequest | null;
	if (!body || body.jsonrpc !== "2.0" || !body.method) {
		return c.json(rpcError(null, -32600, "Invalid Request"), 400);
	}

	const id = body.id ?? null;

	try {
		const result = await dispatch(c.env, body.method, body.params);
		return c.json(rpcOk(id, result));
	} catch (err: any) {
		const code = typeof err?.code === "number" ? err.code : -32603;
		return c.json(rpcError(id, code, err?.message ?? String(err), err?.data));
	}
});

async function dispatch(env: Env, method: string, params: any): Promise<unknown> {
	switch (method) {
		case "initialize":
			return {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: {
					tools: { listChanged: false },
					resources: { listChanged: false },
				},
				serverInfo: SERVER_INFO,
			};

		case "ping":
			return {};

		case "tools/list":
			return {
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
					inputSchema: t.inputSchema,
					...(t._meta ? { _meta: t._meta } : {}),
				})),
			};

		case "tools/call": {
			const name = params?.name as string;
			const args = params?.arguments ?? {};
			if (!name) {
				throw rpcErr(-32602, "Missing tool name");
			}
			const tool = toolByName[name];
			if (!tool) {
				throw rpcErr(-32601, `Unknown tool: ${name}`);
			}
			const out = await tool.execute(env, args);
			// MCP tool result shape: content[] with `type` discriminator.
			return {
				content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
				structuredContent: out,
				isError: false,
			};
		}

		case "resources/list":
			return {
				resources: RESOURCES.map((r) => ({
					uri: r.uri,
					name: r.name,
					description: r.description,
					mimeType: MCP_APP_MIME,
				})),
			};

		case "resources/read": {
			const uri = params?.uri as string | undefined;
			if (!uri) throw rpcErr(-32602, "Missing resource uri");
			const meta = findResource(uri);
			const body = readResourceBody(uri);
			if (!meta || body === null) throw rpcErr(-32601, `Unknown resource: ${uri}`);
			return {
				contents: [{ uri, mimeType: MCP_APP_MIME, text: body }],
			};
		}

		case "prompts/list":
			return { prompts: [] };

		default:
			throw rpcErr(-32601, `Method not found: ${method}`);
	}
}

function rpcOk(id: number | string | null, result: unknown): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

function rpcError(
	id: number | string | null,
	code: number,
	message: string,
	data?: unknown,
): JsonRpcResponse {
	return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function rpcErr(code: number, message: string): Error & { code: number } {
	const e = new Error(message) as Error & { code: number };
	e.code = code;
	return e;
}
