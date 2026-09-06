// View bound to the `export_threads_html` tool. The tool returns the full HTML
// string; this view turns it into a download button (Blob + <a download>) so
// the user can save the file with one click. Works the same whether the call
// came from an agent inside studio or from the manual multi-select in the
// threads-list view.

import { CheckCircle2, Download, FileText } from "lucide-react";
import { useDownloadFile, useMcpHostContext, useMcpState } from "../context";
import { Button } from "../components/button";
import { Card, CardBody, CardHeader } from "../components/card";
import { ViewHeader } from "../components/view-header";
import { formatBytes } from "../lib/format";
import { cn } from "../lib/utils";

interface ExportResult {
	html: string;
	filename: string;
	bytes: number;
	threadCount: number;
}

export function ExportResultView() {
	const { toolResult, status, error } = useMcpState<unknown, ExportResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";
	const downloadFile = useDownloadFile();

	const container = cn(fullscreen ? "p-6 max-w-2xl mx-auto" : "p-3", "space-y-4");

	if (status === "tool-input" || (!toolResult && !error)) {
		return (
			<div className={container}>
				<div className="text-sm text-muted-foreground flex items-center gap-2">
					<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
					Rendering export…
				</div>
			</div>
		);
	}

	if (error || !toolResult) {
		return (
			<div className={container}>
				<Card>
					<CardBody className="text-sm text-destructive">
						Failed to render export: {error ?? "no result"}
					</CardBody>
				</Card>
			</div>
		);
	}

	function download() {
		if (!toolResult) return;
		void downloadFile(toolResult.filename, toolResult.html);
	}

	return (
		<div className={container}>
			{fullscreen ? <ViewHeader title="Export ready" /> : null}
			<Card>
				<CardHeader className="flex items-center gap-2">
					<CheckCircle2 className="size-4 text-primary" />
					<h2 className="font-medium text-sm">HTML export ready</h2>
				</CardHeader>
				<CardBody className="space-y-3">
					<div className="flex items-start gap-3">
						<div className="rounded-md border border-border bg-secondary/30 p-2">
							<FileText className="size-5 text-muted-foreground" />
						</div>
						<div className="min-w-0 flex-1 space-y-0.5">
							<div className="text-sm font-medium truncate">{toolResult.filename}</div>
							<div className="text-xs text-muted-foreground tabular-nums">
								{toolResult.threadCount} {toolResult.threadCount === 1 ? "thread" : "threads"} ·{" "}
								{formatBytes(toolResult.bytes)}
							</div>
						</div>
					</div>
					<Button size="sm" onClick={download} className="w-full justify-center">
						<Download className="size-3.5" />
						Download
					</Button>
				</CardBody>
			</Card>
		</div>
	);
}
