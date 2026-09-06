// Phase-1 debug view: surfaces everything the iframe receives from studio so
// we can sanity-check the bridge wiring before building the real views.
//
// Once Phase 3 ships per-tool views, this stays as the fallback when an
// unknown tool name comes through — useful for evolving the integration.

import { useMcpHostContext, useMcpState } from "../context";

export function DebugView() {
	const state = useMcpState();
	const host = useMcpHostContext();

	return (
		<div className="p-6 space-y-6 max-w-3xl mx-auto">
			<header className="space-y-1">
				<h1 className="text-lg font-semibold">Cury MCP App — debug</h1>
				<p className="text-sm text-muted-foreground">
					Phase-1 scaffold. Per-tool views land in Phase 3.
				</p>
			</header>

			<Section title="MCP state">
				<KV k="status" v={state.status} />
				<KV k="toolName" v={state.toolName ?? "(none)"} />
				{state.error && <KV k="error" v={state.error} mono />}
			</Section>

			<Section title="Host context">
				<KV k="displayMode" v={host?.displayMode ?? "(?)"} />
				<KV k="theme" v={host?.theme ?? "(?)"} />
				<KV k="locale" v={host?.locale ?? "(?)"} />
				<KV k="timeZone" v={host?.timeZone ?? "(?)"} />
				<KV k="platform" v={host?.platform ?? "(?)"} />
				<KV
					k="containerDimensions"
					v={host?.containerDimensions ? JSON.stringify(host.containerDimensions) : "(?)"}
				/>
				<KV k="toolInfo.tool.name" v={host?.toolInfo?.tool?.name ?? "(?)"} />
			</Section>

			{state.toolInput !== undefined && (
				<Section title="Tool input">
					<pre className="text-xs font-mono bg-secondary rounded p-3 overflow-x-auto">
						{JSON.stringify(state.toolInput, null, 2)}
					</pre>
				</Section>
			)}

			{state.toolResult !== undefined && (
				<Section title="Tool result">
					<pre className="text-xs font-mono bg-secondary rounded p-3 overflow-x-auto">
						{JSON.stringify(state.toolResult, null, 2)}
					</pre>
				</Section>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-2">
			<h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
			<div className="rounded border border-border bg-card p-3 space-y-1">{children}</div>
		</section>
	);
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
	return (
		<div className="flex gap-3 text-sm">
			<span className="w-44 shrink-0 text-muted-foreground">{k}</span>
			<span className={mono ? "font-mono" : ""}>{v}</span>
		</div>
	);
}
