// Inline + fullscreen view for list_corpus.
// Shows the R2 bucket contents — what AutoRAG can retrieve from.

import { Database, ExternalLink, FileText } from "lucide-react";
import { useMcpHostContext, useMcpState } from "../context";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardBody, CardHeader } from "../components/card";
import { EmptyState } from "../components/empty";
import { ViewHeader } from "../components/view-header";
import { formatBytes, formatTimeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import type { CorpusResult } from "../types";

const AUTORAG_DASHBOARD = "https://dash.cloudflare.com/?to=/:account/ai/autorag";

export function CorpusView() {
	const { toolResult, status } = useMcpState<unknown, CorpusResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";

	if (status === "tool-input" || !toolResult) {
		return (
			<div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
				<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
				Loading corpus…
			</div>
		);
	}

	const docs = toolResult.docs ?? [];
	const totalBytes = docs.reduce((acc, d) => acc + (d.size || 0), 0);

	if (docs.length === 0) {
		return (
			<EmptyState
				icon={<Database className="size-6" />}
				title="Corpus is empty"
				className="min-h-40"
			>
				No documents in the R2 bucket yet. Run <code>bun run upload-corpus --remote</code> to push
				the markdown files, then trigger a sync on the AutoRAG instance.
			</EmptyState>
		);
	}

	return (
		<div className={cn(fullscreen ? "p-6 max-w-4xl mx-auto space-y-3" : "p-3 space-y-2")}>
			{fullscreen ? (
				<ViewHeader
					title="Knowledge corpus"
					subtitle={
						<>
							Files in <code>cury-corpus</code> (R2). AutoRAG re-indexes on push if auto-sync is on
							— otherwise hit Sync in the dashboard.
						</>
					}
					right={
						<>
							<Badge variant="muted">
								{docs.length} {docs.length === 1 ? "doc" : "docs"}
							</Badge>
							<Badge variant="muted">{formatBytes(totalBytes)}</Badge>
						</>
					}
				/>
			) : (
				<header className="flex items-center justify-between gap-2 flex-wrap">
					<h1 className="text-sm font-medium">Knowledge corpus</h1>
					<div className="flex items-center gap-2">
						<Badge variant="muted">
							{docs.length} {docs.length === 1 ? "doc" : "docs"}
						</Badge>
						<Badge variant="muted">{formatBytes(totalBytes)}</Badge>
					</div>
				</header>
			)}

			<Card>
				<CardBody className="p-0">
					<ul className="divide-y divide-border">
						{docs.map((d) => (
							<li
								key={d.key}
								className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/30 transition-colors"
							>
								<FileText className="size-4 text-muted-foreground shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="text-sm font-medium truncate">{d.prettifiedName}</div>
									<div className="text-[11px] text-muted-foreground truncate font-mono">
										{d.key}
									</div>
								</div>
								<div className="text-xs text-muted-foreground shrink-0 text-right">
									<div>{formatBytes(d.size)}</div>
									<div className="text-[10px]">{formatTimeAgo(new Date(d.uploaded).getTime())}</div>
								</div>
							</li>
						))}
					</ul>
				</CardBody>
			</Card>

			{fullscreen ? (
				<Card>
					<CardHeader>
						<h2 className="font-medium text-sm">Sync</h2>
					</CardHeader>
					<CardBody className="text-xs text-muted-foreground space-y-2">
						<p>
							Re-indexing happens automatically on a schedule, or on-demand from the dashboard. The
							CLI route is <code>bun run upload-corpus --remote</code> followed by Sync.
						</p>
						<Button
							size="sm"
							variant="outline"
							onClick={() => window.open(AUTORAG_DASHBOARD, "_blank")}
						>
							<ExternalLink className="size-3.5" />
							Open AutoRAG dashboard
						</Button>
					</CardBody>
				</Card>
			) : null}
		</div>
	);
}
