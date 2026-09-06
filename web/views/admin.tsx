// The main admin canvas. Bound to get_dashboard. Studio renders this when the
// user navigates to /<org>/settings/connections/<app>/tools/get_dashboard.
//
// Tries to be useful as a quick at-a-glance — status, today's activity, recent
// turns, corpus health, prompt source. Each section has a "→" jump to the
// deeper view via callTool().

import { Activity, BookOpen, Database, MessageSquare, Quote, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Dot } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardBody, CardHeader } from "../components/card";
import { Sparkline } from "../components/sparkline";
import { ThreadsTable } from "../components/threads-table";
import { TurnBubble } from "../components/turn-bubble";
import { useCallTool, useMcpHostContext, useMcpState } from "../context";
import { formatCost, prettifyModel } from "../lib/format";
import { cn } from "../lib/utils";
import type { DashboardResult, DashboardWindow, ThreadDetailResult, ThreadSummary } from "../types";

export function AdminView() {
	const { toolName, toolResult, status } = useMcpState<unknown, DashboardResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";
	const callTool = useCallTool();

	const [activeThread, setActiveThread] = useState<{ id: string; data: ThreadDetailResult } | null>(
		null,
	);
	const [loadingThread, setLoadingThread] = useState(false);
	const [fallbackData, setFallbackData] = useState<DashboardResult | null>(null);
	const [fallbackError, setFallbackError] = useState<string | null>(null);

	// When studio opens us as a home tile (or any entrypoint without
	// toolInfo.tool.name pointing at get_dashboard), there's no preloaded
	// result. Fetch it ourselves on mount so the dashboard is always useful.
	const hostHasNoTool = toolName !== "get_dashboard";
	const needsFallback = hostHasNoTool && !toolResult && !fallbackData;

	useEffect(() => {
		if (!needsFallback) return;
		let cancelled = false;
		callTool<DashboardResult>("get_dashboard", {}, { navigate: false })
			.then((d) => {
				if (!cancelled) setFallbackData(d);
			})
			.catch((err) => {
				if (!cancelled) setFallbackError(String(err?.message ?? err));
			});
		return () => {
			cancelled = true;
		};
	}, [needsFallback, callTool]);

	const d = toolResult ?? fallbackData;

	if (status === "tool-input" || !d) {
		return (
			<div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
				<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
				{fallbackError ? (
					<span className="text-destructive">Failed to load dashboard: {fallbackError}</span>
				) : (
					<>Loading dashboard…</>
				)}
			</div>
		);
	}

	async function openThread(id: string) {
		setLoadingThread(true);
		try {
			// In-place: keep the dashboard, expand the row into the activity card.
			const data = await callTool<ThreadDetailResult>(
				"get_thread",
				{ thread_id: id },
				{ navigate: false },
			);
			setActiveThread({ id, data });
		} catch (err) {
			console.error(err);
		} finally {
			setLoadingThread(false);
		}
	}

	return (
		<div className={cn(fullscreen ? "p-6 max-w-6xl mx-auto" : "p-3", "space-y-4")}>
			{/* HEADER STRIP */}
			<header className="flex items-center justify-between gap-3 flex-wrap">
				<div className="space-y-1 min-w-0 flex-1">
					<h1 className={cn(fullscreen ? "text-xl font-semibold" : "text-base font-medium")}>
						{d.status.whatsapp.verifiedName ?? "Cury Chat"}
					</h1>
					<div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap min-w-0">
						<Dot ok={d.status.ok} />
						<span className="font-mono">{prettifyModel(d.status.model)}</span>
						<span>·</span>
						<span>{d.status.whatsapp.displayPhone ?? "(loading number…)"}</span>
						<Badge variant={d.status.ragEnabled ? "ok" : "warn"}>
							{d.status.ragEnabled ? "RAG on" : "RAG off"}
						</Badge>
					</div>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => callTool("get_dashboard", {}, { navigate: false })}
				>
					Refresh
				</Button>
			</header>

			{/* COST + ACTIVITY WINDOWS */}
			<section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				<WindowCard label="Today" window={d.windows.today} />
				<WindowCard label="This week" window={d.windows.week} />
				<WindowCard label="This month" window={d.windows.month} />
			</section>

			{/* TREND SPARKLINES */}
			<section className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<TrendCard
					label="Daily cost"
					sublabel="last 14 days"
					icon={<Sparkles className="size-3.5" />}
					data={d.daily.map((p) => ({ date: p.date, value: p.cost }))}
					format={(v) => formatCost(v)}
				/>
				<TrendCard
					label="Daily RAG"
					sublabel="grounded replies"
					icon={<Quote className="size-3.5" />}
					data={d.daily.map((p) => ({ date: p.date, value: p.rag ?? 0 }))}
					format={(v) => v.toLocaleString()}
				/>
				<TrendCard
					label="Daily messages"
					sublabel="last 14 days"
					icon={<MessageSquare className="size-3.5" />}
					data={d.daily.map((p) => ({ date: p.date, value: p.messages }))}
					format={(v) => v.toLocaleString()}
				/>
			</section>

			<div className={cn("grid gap-4", fullscreen ? "md:grid-cols-3" : "grid-cols-1")}>
				{/* TODAY'S THREADS — primary view */}
				<Card className={cn(fullscreen ? "md:col-span-2" : "")}>
					<CardHeader className="flex items-center justify-between gap-2">
						<h2 className="font-medium text-sm">
							Today's threads
							<span className="ml-2 text-xs text-muted-foreground">({d.todayThreads.length})</span>
						</h2>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => callTool("list_threads", { limit: 200 })}
						>
							All threads →
						</Button>
					</CardHeader>
					<CardBody className="p-0">
						{activeThread ? (
							<div className="p-3 space-y-3">
								<div className="flex items-center justify-between">
									<button
										type="button"
										onClick={() => setActiveThread(null)}
										className="text-xs text-muted-foreground hover:underline"
									>
										← back to today's threads
									</button>
									<Badge variant="muted">{activeThread.id}</Badge>
								</div>
								<div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
									{activeThread.data.turns.map((t, i) => (
										<TurnBubble key={`${t.ts}-${i}`} turn={t} />
									))}
								</div>
							</div>
						) : (
							<ThreadsTable
								threads={d.todayThreads as ThreadSummary[]}
								onOpen={(id) => openThread(id)}
								emptyHint={
									<div className="text-sm text-muted-foreground p-4">
										No activity yet today. The bot persists turns as they come in.
									</div>
								}
							/>
						)}
					</CardBody>
				</Card>

				{/* SIDE COLUMN */}
				<div className="space-y-4">
					{/* KNOWLEDGE BASE */}
					<Card>
						<CardHeader className="flex items-center gap-2">
							<Database className="size-4 text-muted-foreground" />
							<h2 className="font-medium text-sm">Knowledge base</h2>
						</CardHeader>
						<CardBody className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Documents</span>
								<span className="font-mono">{d.corpusCount}</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">RAG instance</span>
								<span className="font-mono text-xs">{d.status.autoragInstance ?? "—"}</span>
							</div>
							<Button
								size="sm"
								variant="ghost"
								className="w-full justify-center"
								onClick={() => callTool("list_corpus", { limit: 200 })}
							>
								Browse corpus →
							</Button>
						</CardBody>
					</Card>

					{/* SYSTEM PROMPT */}
					<Card>
						<CardHeader className="flex items-center gap-2">
							<BookOpen className="size-4 text-muted-foreground" />
							<h2 className="font-medium text-sm">System prompt</h2>
						</CardHeader>
						<CardBody className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Source</span>
								<Badge variant={d.promptSource === "kv-override" ? "primary" : "muted"}>
									{d.promptSource === "kv-override" ? "KV override" : "Bundled"}
								</Badge>
							</div>
							<Button
								size="sm"
								variant="ghost"
								className="w-full justify-center"
								onClick={() => callTool("get_system_prompt")}
							>
								Edit prompt →
							</Button>
						</CardBody>
					</Card>

					{/* QUICK ACTIONS */}
					<Card>
						<CardHeader>
							<h2 className="font-medium text-sm">Quick actions</h2>
						</CardHeader>
						<CardBody className="space-y-2">
							<Button
								size="sm"
								variant="outline"
								className="w-full justify-center"
								onClick={() => callTool("send_text", { to: "", text: "" })}
							>
								<Send className="size-3.5" />
								Send a message
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="w-full justify-center"
								onClick={() => callTool("get_status")}
							>
								<Activity className="size-3.5" />
								Show status detail
							</Button>
						</CardBody>
					</Card>
				</div>
			</div>
		</div>
	);
}

function WindowCard({ label, window: w }: { label: string; window: DashboardWindow }) {
	const avg = w.days && w.days > 0 ? w.cost / w.days : undefined;
	return (
		<Card>
			<CardBody className="space-y-1.5 py-3">
				<div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
				<div className="text-xl font-semibold tabular-nums">{formatCost(w.cost)}</div>
				{avg !== undefined ? (
					<div className="text-[11px] text-muted-foreground tabular-nums">
						avg {formatCost(avg)}/day
					</div>
				) : null}
				<div className="text-xs text-muted-foreground tabular-nums pt-1">
					{w.messages.toLocaleString()} {w.messages === 1 ? "message" : "messages"}
					{" · "}
					{w.uniqueUsers.toLocaleString()} {w.uniqueUsers === 1 ? "user" : "users"}
				</div>
			</CardBody>
		</Card>
	);
}

function TrendCard({
	label,
	sublabel,
	icon,
	data,
	format,
}: {
	label: string;
	sublabel: string;
	icon?: React.ReactNode;
	data: Array<{ date: string; value: number }>;
	format: (v: number) => string;
}) {
	const total = data.reduce((sum, d) => sum + d.value, 0);
	const peak = data.reduce(
		(p, d) => (d.value > p.value ? d : p),
		data[0] ?? { date: "—", value: 0 },
	);
	return (
		<Card>
			<CardBody className="space-y-2 py-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
						{icon}
						{label}
					</div>
					<span className="text-[10px] text-muted-foreground">{sublabel}</span>
				</div>
				<Sparkline data={data} format={format} ariaLabel={`${label} ${sublabel}`} />
				<div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
					<span>total {format(total)}</span>
					<span>
						peak {format(peak.value)} · {peak.date.slice(5)}
					</span>
				</div>
			</CardBody>
		</Card>
	);
}
