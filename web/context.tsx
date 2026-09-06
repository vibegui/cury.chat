// MCP App bridge — wires @modelcontextprotocol/ext-apps's useApp() into React.
//
// Mirrors the canonical mcp-app template's context.tsx (~/Projects/mcp-app/web/context.tsx)
// with two additions:
//
//   useCallTool()        — call another tool on this server; the host proxies it.
//                          Optionally swaps the iframe to that tool's view by
//                          updating McpState — useful for in-UI navigation
//                          ("→ Browse corpus" buttons, etc.).
//   useNavigateToTool()  — explicit version of the above that ALWAYS updates state.

import {
	type App,
	type McpUiHostContext,
	useApp,
	useDocumentTheme,
	useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useCallback,
	useContext,
	useState,
} from "react";
import { INITIAL_STATE, type McpState } from "./types";

const McpStateContext = createContext<McpState>(INITIAL_STATE);
const McpStateSetterContext = createContext<Dispatch<SetStateAction<McpState>> | null>(null);
const McpAppContext = createContext<App | null>(null);
const McpHostContext = createContext<McpUiHostContext | undefined>(undefined);

export function McpProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<McpState>(INITIAL_STATE);
	const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>(undefined);

	const onAppCreated = useCallback((app: App) => {
		app.ontoolinput = (params) => {
			setState((prev) => ({ ...prev, status: "tool-input", toolInput: params.arguments }));
		};

		app.ontoolresult = (result) => {
			if (result.isError) {
				const textBlock = result.content?.find((c) => c.type === "text");
				const errorText =
					(textBlock?.type === "text" ? textBlock.text : undefined) ?? "Tool returned an error";
				setState((prev) => ({ ...prev, status: "error", error: errorText }));
				return;
			}
			setState((prev) => ({
				...prev,
				status: "tool-result",
				toolResult: result.structuredContent,
			}));
		};

		app.ontoolcancelled = () => {
			setState((prev) => ({ ...prev, status: "tool-cancelled" }));
		};

		app.onerror = (err) => {
			console.error("MCP App error:", err);
		};

		app.onhostcontextchanged = (ctx) => {
			setHostContext((prev) => ({ ...prev, ...ctx }));
		};
	}, []);

	const { app, isConnected } = useApp({
		appInfo: { name: "Cury MCP App", version: "0.1.0" },
		capabilities: {},
		onAppCreated,
	});

	useHostStyles(app, app?.getHostContext());

	if (isConnected && state.status === "initializing") {
		const ctx = app?.getHostContext();
		if (ctx) setHostContext(ctx);
		const toolName = ctx?.toolInfo?.tool.name;
		setState({ status: "connected", toolName });
	}

	return (
		<McpAppContext.Provider value={app}>
			<McpHostContext.Provider value={hostContext}>
				<McpStateSetterContext.Provider value={setState}>
					<McpStateContext.Provider value={state}>{children}</McpStateContext.Provider>
				</McpStateSetterContext.Provider>
			</McpHostContext.Provider>
		</McpAppContext.Provider>
	);
}

export function useMcpState<TInput = unknown, TResult = unknown>() {
	return useContext(McpStateContext) as McpState<TInput, TResult>;
}

export function useMcpApp() {
	return useContext(McpAppContext);
}

export function useMcpHostContext() {
	return useContext(McpHostContext);
}

export function useTheme() {
	return useDocumentTheme();
}

/**
 * Call a tool on the same MCP server. The host proxies the call through its
 * own MCP client — the UI never needs the worker URL or token.
 *
 * By default the result is ALSO written into McpState so the router re-renders
 * with the new tool's view. Pass `{ navigate: false }` to suppress that (e.g.
 * for an in-place data refresh).
 */
export function useCallTool() {
	const app = useMcpApp();
	const setState = useContext(McpStateSetterContext);
	return useCallback(
		async <T = unknown>(
			name: string,
			args: Record<string, unknown> = {},
			opts: { navigate?: boolean } = {},
		): Promise<T> => {
			if (!app) throw new Error("MCP App not connected yet");
			const navigate = opts.navigate !== false;

			if (navigate && setState) {
				// Optimistic: switch the view immediately, show its loading state.
				setState((prev) => ({
					...prev,
					status: "tool-input",
					toolName: name,
					toolInput: args,
					toolResult: undefined,
					error: undefined,
				}));
			}

			let result: Awaited<ReturnType<typeof app.callServerTool>>;
			try {
				result = await app.callServerTool({ name, arguments: args });
			} catch (err) {
				if (navigate && setState) {
					setState((prev) => ({ ...prev, status: "error", error: String(err) }));
				}
				throw err;
			}

			if (result?.isError) {
				const textBlock = result.content?.find((c) => c.type === "text");
				const message =
					textBlock?.type === "text" ? textBlock.text : `Tool ${name} returned an error`;
				if (navigate && setState) {
					setState((prev) => ({ ...prev, status: "error", error: message }));
				}
				throw new Error(message);
			}

			if (navigate && setState) {
				setState((prev) => ({
					...prev,
					status: "tool-result",
					toolName: name,
					toolResult: result.structuredContent,
				}));
			}

			return result.structuredContent as T;
		},
		[app, setState],
	);
}

/**
 * Download a text file to the user's machine.
 *
 * MCP apps run in a sandboxed iframe where a programmatic `<a download>` click
 * is silently blocked unless the host granted `allow-downloads`. The host
 * exposes a mediated `ui/download-file` channel for exactly this; we prefer it
 * when the host advertises the `downloadFile` capability and fall back to the
 * blob-anchor trick otherwise (works in non-sandboxed dev/standalone).
 */
export function useDownloadFile() {
	const app = useMcpApp();
	return useCallback(
		async (filename: string, text: string, mimeType = "text/html;charset=utf-8"): Promise<void> => {
			const canHostDownload = !!app?.getHostCapabilities?.()?.downloadFile;
			if (app && canHostDownload) {
				const res = await app.downloadFile({
					contents: [
						{
							type: "resource",
							resource: { uri: `file:///${filename}`, mimeType, text },
						},
					],
				});
				if (!res?.isError) return;
				// Host denied/cancelled — fall through to the anchor attempt.
			}

			const blob = new Blob([text], { type: mimeType });
			const url = URL.createObjectURL(blob);
			try {
				const a = document.createElement("a");
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		[app],
	);
}

/**
 * Read a resource on the same MCP server. Mirrors useCallTool but for
 * resources/read. Does not navigate.
 */
export function useReadResource() {
	const app = useMcpApp();
	return useCallback(
		async (uri: string) => {
			if (!app) throw new Error("MCP App not connected yet");
			return app.readServerResource({ uri });
		},
		[app],
	);
}
