// Inline + fullscreen view for list_threads.
// Each row is a phone+date thread; clicking opens get_thread in place.
//
// In fullscreen mode the table is multi-selectable so the operator can pick
// threads and export them as a single HTML file (via the export_threads_html
// tool). Selection state is local to this view.

import { Download, Inbox, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { EmptyState } from "../components/empty";
import { ThreadsTable } from "../components/threads-table";
import { TurnBubble } from "../components/turn-bubble";
import { ViewHeader } from "../components/view-header";
import { useCallTool, useDownloadFile, useMcpHostContext, useMcpState } from "../context";
import { cn } from "../lib/utils";
import type { ThreadDetailResult, ThreadsListResult } from "../types";

interface ExportResult {
	html: string;
	filename: string;
	bytes: number;
	threadCount: number;
}

export function ThreadsListView() {
	const { toolResult, status } = useMcpState<unknown, ThreadsListResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";
	const callTool = useCallTool();
	const downloadFile = useDownloadFile();

	const [openThread, setOpenThread] = useState<{
		id: string;
		data: ThreadDetailResult | null;
	} | null>(null);
	const [loadingThread, setLoadingThread] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);

	if (status === "tool-input" || !toolResult) {
		return (
			<div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
				<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
				Loading threads…
			</div>
		);
	}

	const threads = toolResult.threads ?? [];

	async function open(threadId: string) {
		setOpenThread({ id: threadId, data: null });
		setLoadingThread(true);
		try {
			const detail = await callTool<ThreadDetailResult>(
				"get_thread",
				{ thread_id: threadId },
				{ navigate: false },
			);
			setOpenThread({ id: threadId, data: detail });
		} catch (err) {
			console.error("get_thread failed", err);
		} finally {
			setLoadingThread(false);
		}
	}

	function close() {
		setOpenThread(null);
	}

	function toggleSelected(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAll(on: boolean) {
		setSelected(on ? new Set(threads.map((t) => t.threadId)) : new Set());
	}

	function clearSelection() {
		setSelected(new Set());
	}

	async function exportSelected() {
		if (selected.size === 0) return;
		setExporting(true);
		setExportError(null);
		try {
			const result = await callTool<ExportResult>(
				"export_threads_html",
				{ thread_ids: [...selected] },
				{ navigate: false },
			);
			await downloadFile(result.filename, result.html);
			clearSelection();
		} catch (err) {
			console.error("export_threads_html failed", err);
			setExportError(err instanceof Error ? err.message : String(err));
		} finally {
			setExporting(false);
		}
	}

	const container = cn(fullscreen ? "p-6 max-w-6xl mx-auto" : "p-3");

	if (threads.length === 0 && !openThread) {
		return (
			<div className={container}>
				{fullscreen ? <ViewHeader title="Threads" /> : null}
				<EmptyState icon={<Inbox className="size-6" />} title="No threads yet" className="min-h-40">
					No conversations have been recorded yet. The bot persists a thread when someone messages
					the bound WhatsApp number.
				</EmptyState>
			</div>
		);
	}

	return (
		<div className={container}>
			{fullscreen ? (
				<ViewHeader
					title={openThread ? "Thread" : "Threads"}
					subtitle={openThread ? openThread.id : `${threads.length} total`}
					onBack={openThread ? close : undefined}
					right={
						<Badge variant="muted">
							{openThread
								? openThread.id
								: `${threads.length} ${threads.length === 1 ? "thread" : "threads"}`}
						</Badge>
					}
				/>
			) : null}

			{openThread ? (
				<div className="space-y-3">
					{!fullscreen ? (
						<div className="flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={close}
								className="text-xs text-muted-foreground hover:underline"
							>
								← back to threads
							</button>
							<Badge variant="muted">{openThread.id}</Badge>
						</div>
					) : null}
					{loadingThread || !openThread.data ? (
						<div className="text-xs text-muted-foreground flex items-center gap-2">
							<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
							Loading turns…
						</div>
					) : openThread.data.turns.length === 0 ? (
						<EmptyState title="No turns in this thread" />
					) : (
						<>
							{openThread.data.contactName ? (
								<div className="px-1 text-xs text-muted-foreground">
									Conversation with{" "}
									<span className="font-medium text-foreground">{openThread.data.contactName}</span>
								</div>
							) : null}
							<div className="flex flex-col gap-2">
								{openThread.data.turns.map((t, i) => (
									<TurnBubble key={`${t.ts}-${i}`} turn={t} />
								))}
							</div>
						</>
					)}
				</div>
			) : (
				<>
					{!fullscreen ? (
						<header className="flex items-center justify-between gap-2 mb-2">
							<h2 className="text-sm font-medium">Recent threads</h2>
							<Badge variant="muted">
								{threads.length} {threads.length === 1 ? "thread" : "threads"}
							</Badge>
						</header>
					) : null}
					{/* Always-present, fixed-height toolbar so selecting threads never
					    shifts the table down (no CLS). Swaps the help hint for the
					    selection actions in place. */}
					{fullscreen ? (
						<div className="mb-3 flex min-h-9 items-center justify-between gap-3">
							{selected.size > 0 ? (
								<>
									<div className="flex min-w-0 items-center gap-2 text-sm">
										<Badge variant="primary">
											{selected.size} {selected.size === 1 ? "thread" : "threads"} selected
										</Badge>
										{exportError ? (
											<span className="text-xs text-destructive truncate max-w-[40ch]">
												{exportError}
											</span>
										) : null}
									</div>
									<div className="flex items-center gap-2">
										<Button size="sm" variant="ghost" onClick={clearSelection} disabled={exporting}>
											<X className="size-3.5" />
											Clear
										</Button>
										<Button size="sm" onClick={exportSelected} disabled={exporting}>
											{exporting ? (
												<span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
											) : (
												<Download className="size-3.5" />
											)}
											Export HTML
										</Button>
									</div>
								</>
							) : (
								<div className="text-[11px] text-muted-foreground">
									Click a row to open the thread · use the checkbox to select threads for export.
								</div>
							)}
						</div>
					) : null}
					<ThreadsTable
						threads={fullscreen ? threads : threads.slice(0, 5)}
						onOpen={open}
						showDate
						showPreview={fullscreen}
						selectable={fullscreen}
						selected={selected}
						onToggleSelected={toggleSelected}
						onToggleAll={toggleAll}
					/>
					{!fullscreen && threads.length > 5 ? (
						<div className="text-[11px] text-muted-foreground mt-2 text-right">
							+{threads.length - 5} more · open in panel for full list
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
