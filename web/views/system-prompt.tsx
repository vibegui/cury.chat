// Inline view for get_system_prompt — shows source + preview, with an
// "Edit" button that requests fullscreen and reveals the editor.
// Fullscreen mode also handles set_system_prompt (when invoked directly).

import { CheckCircle2, FileText, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCallTool, useMcpApp, useMcpHostContext, useMcpState } from "../context";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardBody, CardHeader } from "../components/card";
import { ViewHeader } from "../components/view-header";
import { cn } from "../lib/utils";
import type { SystemPromptResult } from "../types";

export function SystemPromptView() {
	const { toolResult, toolName, status } = useMcpState<unknown, SystemPromptResult>();
	const host = useMcpHostContext();
	const app = useMcpApp();
	const callTool = useCallTool();
	const fullscreen = host?.displayMode === "fullscreen";

	// If the tool that opened us was set_system_prompt, the result is a
	// {ok, source, length} ack — but we still want to render the editor with
	// the current prompt. We fetch via get_system_prompt on mount.
	const [draft, setDraft] = useState<string>("");
	const [current, setCurrent] = useState<SystemPromptResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		// If toolResult IS a SystemPromptResult (the get_system_prompt case), use it.
		// Otherwise fetch.
		if (toolResult && (toolResult as SystemPromptResult).prompt !== undefined) {
			const p = toolResult as SystemPromptResult;
			setCurrent(p);
			setDraft(p.prompt);
			return;
		}
		if (toolName === "set_system_prompt") {
			// We just set it — fetch the new value (in place — don't navigate the router).
			(async () => {
				try {
					const got = await callTool<SystemPromptResult>(
						"get_system_prompt",
						{},
						{ navigate: false },
					);
					setCurrent(got);
					setDraft(got.prompt);
				} catch (err) {
					console.error("get_system_prompt failed", err);
				}
			})();
		}
	}, [toolResult, toolName, callTool]);

	const dirty = useMemo(() => current && draft.trim() !== current.prompt.trim(), [draft, current]);

	if (!current && status === "tool-input") {
		return <Loading />;
	}
	if (!current) return <Loading />;

	const previewLines = current.prompt.split("\n").slice(0, fullscreen ? 999 : 10);
	const truncated = !fullscreen && current.prompt.split("\n").length > 10;

	async function save() {
		setBusy(true);
		try {
			await callTool("set_system_prompt", { prompt: draft }, { navigate: false });
			const got = await callTool<SystemPromptResult>("get_system_prompt", {}, { navigate: false });
			setCurrent(got);
			setDraft(got.prompt);
			setSavedAt(Date.now());
		} catch (err) {
			console.error(err);
		} finally {
			setBusy(false);
		}
	}

	async function revertToBundled() {
		setBusy(true);
		try {
			await callTool("set_system_prompt", { prompt: "" });
			const got = await callTool<SystemPromptResult>("get_system_prompt");
			setCurrent(got);
			setDraft(got.prompt);
			setSavedAt(Date.now());
		} catch (err) {
			console.error(err);
		} finally {
			setBusy(false);
		}
	}

	function requestFullscreen() {
		app?.requestDisplayMode({ mode: "fullscreen" }).catch((err) => {
			console.warn("fullscreen request rejected", err);
		});
	}

	if (!fullscreen) {
		// INLINE — read-only preview + "Edit" button
		return (
			<div className="p-3 space-y-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<FileText className="size-4 text-muted-foreground" />
						<span className="text-sm font-medium">System prompt</span>
						<SourceBadge source={current.source} />
					</div>
					<Button variant="ghost" size="sm" onClick={requestFullscreen}>
						<Pencil className="size-3.5" />
						Edit
					</Button>
				</div>
				<Card>
					<CardBody className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-muted-foreground">
						{previewLines.join("\n")}
						{truncated ? <div className="mt-1 text-[10px]">… (truncated)</div> : null}
					</CardBody>
				</Card>
			</div>
		);
	}

	// FULLSCREEN — full editor
	return (
		<div className="p-6 max-w-4xl mx-auto space-y-3">
			<ViewHeader
				title="System prompt"
				subtitle="Live override stored in CONFIG KV. Falls back to the bundled prompt when empty. Takes effect on the next incoming message."
				right={<SourceBadge source={current.source} />}
			/>

			<Card>
				<CardHeader className="flex items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">
						{draft.length.toLocaleString()} chars · {draft.split("\n").length} lines
					</span>
					{savedAt ? (
						<span className="flex items-center gap-1 text-xs text-emerald-600">
							<CheckCircle2 className="size-3.5" /> saved
						</span>
					) : null}
				</CardHeader>
				<CardBody>
					<textarea
						value={draft}
						onChange={(e) => {
							setDraft(e.target.value);
							setSavedAt(null);
						}}
						className={cn(
							"w-full min-h-[60vh] resize-y rounded border border-input bg-background",
							"p-3 font-mono text-xs leading-relaxed",
							"focus:outline-none focus:ring-2 focus:ring-ring",
						)}
						spellCheck={false}
					/>
				</CardBody>
			</Card>

			<div className="flex items-center justify-end gap-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={revertToBundled}
					disabled={busy || current.source === "bundled-fallback"}
				>
					<RotateCcw className="size-3.5" />
					Revert to bundled
				</Button>
				<Button variant="primary" onClick={save} disabled={busy || !dirty}>
					{busy ? "Saving…" : dirty ? "Save override" : "No changes"}
				</Button>
			</div>
		</div>
	);
}

function SourceBadge({ source }: { source: SystemPromptResult["source"] }) {
	if (source === "kv-override") return <Badge variant="primary">KV override</Badge>;
	return <Badge variant="muted">Bundled</Badge>;
}

function Loading() {
	return (
		<div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
			<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
			Loading prompt…
		</div>
	);
}
