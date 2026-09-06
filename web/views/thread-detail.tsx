// Inline + fullscreen view for get_thread. Chat-bubble transcript.

import { MessageCircleOff } from "lucide-react";
import { useMcpHostContext, useMcpState } from "../context";
import { Badge } from "../components/badge";
import { Card, CardBody } from "../components/card";
import { ContactLine } from "../components/contact-line";
import { EmptyState } from "../components/empty";
import { TurnBubble } from "../components/turn-bubble";
import { ViewHeader } from "../components/view-header";
import { formatCost, formatTimeAgo, prettifyModel } from "../lib/format";
import { cn } from "../lib/utils";
import type { ThreadDetailResult, Turn } from "../types";

export function ThreadDetailView() {
	const { toolResult, status } = useMcpState<unknown, ThreadDetailResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";

	if (status === "tool-input" || !toolResult) {
		return (
			<div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
				<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
				Loading thread…
			</div>
		);
	}

	const { threadId, phone, contactName, turns, length } = toolResult;
	const dateSuffix = threadId.includes(":") ? threadId.slice(threadId.indexOf(":") + 1) : "";
	const totals = computeTotals(turns);

	if (length === 0) {
		return (
			<div className={cn(fullscreen ? "p-6 max-w-4xl mx-auto" : "p-3")}>
				{fullscreen ? (
					<ViewHeader
						title={contactName ?? phone}
						subtitle={
							<ContactLine phone={phone} name={contactName} compact className="opacity-80" />
						}
					/>
				) : null}
				<EmptyState
					icon={<MessageCircleOff className="size-6" />}
					title="No turns yet"
					className="min-h-40"
				>
					This thread exists but has no recorded messages.
				</EmptyState>
			</div>
		);
	}

	return (
		<div className={cn("flex gap-0", fullscreen ? "min-h-dvh flex-col md:flex-row" : "")}>
			<div className={cn("flex-1 flex flex-col min-w-0", fullscreen ? "" : "p-3")}>
				{fullscreen ? (
					<div className="px-6 pt-5 pb-3 border-b border-border">
						<ViewHeader
							title={contactName ?? "Thread"}
							subtitle={
								<ContactLine phone={phone} name={contactName} compact className="opacity-80" />
							}
							right={
								<>
									<Badge variant="muted">{length} turns</Badge>
									<Badge variant="muted">{dateSuffix}</Badge>
								</>
							}
						/>
					</div>
				) : (
					<header className="px-1 pb-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
						<ContactLine phone={phone} name={contactName} compact />
						<span>· {length} turns</span>
						<span>· {dateSuffix}</span>
					</header>
				)}

				<div className={cn("flex flex-col gap-2 overflow-y-auto", fullscreen ? "p-6 flex-1" : "")}>
					{turns.map((t, i) => (
						<TurnBubble
							key={`${t.ts}-${i}`}
							turn={t}
							recipientName={t.role === "user" ? contactName : undefined}
						/>
					))}
				</div>
			</div>

			{fullscreen ? (
				<aside className="hidden md:flex w-72 shrink-0 border-l border-border p-5 flex-col gap-3">
					<h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Summary
					</h2>
					<Card>
						<CardBody className="space-y-2 text-sm">
							<Row label="Turns" value={String(length)} />
							<Row label="User msgs" value={String(totals.userTurns)} />
							<Row
								label="Tokens"
								value={totals.totalTokens ? totals.totalTokens.toLocaleString() : "—"}
							/>
							<Row label="Cost" value={formatCost(totals.totalCost)} />
							{totals.firstTs ? (
								<Row label="First msg" value={formatTimeAgo(totals.firstTs)} />
							) : null}
							{totals.lastTs ? <Row label="Last msg" value={formatTimeAgo(totals.lastTs)} /> : null}
							{totals.modelCounts.size > 0 ? (
								<div className="pt-1">
									<div className="text-xs text-muted-foreground mb-1">Models</div>
									<div className="flex flex-wrap gap-1">
										{[...totals.modelCounts.entries()].map(([m, n]) => (
											<Badge key={m} variant="muted">
												{prettifyModel(m)} × {n}
											</Badge>
										))}
									</div>
								</div>
							) : null}
						</CardBody>
					</Card>
				</aside>
			) : null}
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="font-mono text-xs">{value}</span>
		</div>
	);
}

function computeTotals(turns: Turn[]) {
	let userTurns = 0;
	let totalTokens = 0;
	let totalCost = 0;
	let firstTs: number | undefined;
	let lastTs: number | undefined;
	const modelCounts = new Map<string, number>();
	for (const t of turns) {
		if (t.role === "user") userTurns += 1;
		if (t.usage?.total_tokens) totalTokens += t.usage.total_tokens;
		if (t.usage?.cost) totalCost += t.usage.cost;
		if (!firstTs || t.ts < firstTs) firstTs = t.ts;
		if (!lastTs || t.ts > lastTs) lastTs = t.ts;
		if (t.model) modelCounts.set(t.model, (modelCounts.get(t.model) ?? 0) + 1);
	}
	return { userTurns, totalTokens, totalCost, firstTs, lastTs, modelCounts };
}
