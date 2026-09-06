// Single-page router: each MCP tool maps to a view component. Routing happens
// at runtime based on hostContext.toolInfo.tool.name (set by studio when it
// opens the iframe). Same pattern as ~/Projects/mcp-app/web/router.tsx.
//
// Phase 1 ships only the DebugView so we can verify the bridge wiring against
// studio. Phases 3-4 fill in the per-tool views.

import { useMcpHostContext, useMcpState } from "./context";
import { AdminView } from "./views/admin";
import { AnalyticsView } from "./views/analytics";
import { CorpusView } from "./views/corpus";
import { ExportResultView } from "./views/export-result";
import { SendTextView } from "./views/send-text";
import { StatusPillView } from "./views/status-pill";
import { SystemPromptView } from "./views/system-prompt";
import { ThreadDetailView } from "./views/thread-detail";
import { ThreadsListView } from "./views/threads-list";

const TOOL_PAGES: Record<string, React.ComponentType> = {
	list_threads: ThreadsListView,
	get_thread: ThreadDetailView,
	get_system_prompt: SystemPromptView,
	set_system_prompt: SystemPromptView,
	get_status: StatusPillView,
	send_text: SendTextView,
	list_corpus: CorpusView,
	get_dashboard: AdminView,
	get_analytics: AnalyticsView,
	export_threads_html: ExportResultView,
};

function ToolRouter() {
	const { toolName, status } = useMcpState();

	if (status === "initializing") {
		return (
			<div className="flex items-center justify-center min-h-dvh p-6 text-sm text-muted-foreground">
				<span className="w-4 h-4 mr-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
				Connecting to host…
			</div>
		);
	}

	// Default to the admin dashboard when no tool name is set — this happens
	// when studio renders us from a "Home tile" or any other entrypoint that
	// doesn't carry tool context. AdminView auto-fetches get_dashboard on
	// mount so it's useful even without a preloaded result.
	const Page = (toolName ? TOOL_PAGES[toolName] : undefined) ?? AdminView;
	return <Page />;
}

export function AppRouter() {
	return (
		<RootLayout>
			<ToolRouter />
		</RootLayout>
	);
}

function RootLayout({ children }: { children: React.ReactNode }) {
	const hostContext = useMcpHostContext();
	const insets = hostContext?.safeAreaInsets;
	return (
		<div
			className="min-h-dvh bg-background text-foreground"
			style={
				insets
					? {
							paddingTop: `${insets.top}px`,
							paddingRight: `${insets.right}px`,
							paddingBottom: `${insets.bottom}px`,
							paddingLeft: `${insets.left}px`,
						}
					: undefined
			}
		>
			{children}
		</div>
	);
}
