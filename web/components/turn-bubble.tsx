// One chat bubble in a thread transcript. User bubbles align right, assistant
// bubbles align left. Assistant bubbles include a tiny footer with model + cost
// + citation count, expandable to show the citation list.

import { useState } from "react";
import { formatCost, formatTimeAgo, prettifyModel } from "../lib/format";
import { cn } from "../lib/utils";
import type { Turn } from "../types";
import { Badge } from "./badge";
import { Card, CardBody } from "./card";

export function TurnBubble({ turn, recipientName }: { turn: Turn; recipientName?: string }) {
	const [expanded, setExpanded] = useState(false);
	const isUser = turn.role === "user";

	return (
		<div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
					isUser
						? "bg-secondary text-secondary-foreground rounded-br-sm"
						: "bg-primary/10 text-foreground rounded-bl-sm",
				)}
			>
				{!isUser && recipientName ? (
					<div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
						{recipientName}
					</div>
				) : null}
				<div>{turn.content}</div>
				<div
					className={cn(
						"mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground",
						isUser ? "justify-end" : "justify-start",
					)}
				>
					<span>{formatTimeAgo(turn.ts)}</span>
					{turn.model ? <span>· {prettifyModel(turn.model)}</span> : null}
					{turn.usage?.cost !== undefined ? <span>· {formatCost(turn.usage.cost)}</span> : null}
					{turn.usage?.total_tokens !== undefined ? (
						<span>· {turn.usage.total_tokens.toLocaleString()} toks</span>
					) : null}
					{turn.citations?.length ? (
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="underline-offset-2 hover:underline"
						>
							· {turn.citations.length} citation{turn.citations.length > 1 ? "s" : ""}
						</button>
					) : null}
				</div>
				{expanded && turn.citations?.length ? (
					<Card className="mt-2 bg-card/60">
						<CardBody className="space-y-2 py-2">
							{turn.citations.map((c, i) => {
								const source = typeof c === "string" ? c : c.source;
								const text = typeof c === "string" ? undefined : c.text;
								return (
									<div key={`${source}-${i}`} className="flex items-start gap-2 text-xs">
										<Badge variant="muted">[{i + 1}]</Badge>
										<div className="min-w-0 space-y-0.5">
											<div className="font-medium break-words">{source}</div>
											{text ? (
												<p className="text-muted-foreground leading-snug break-words whitespace-pre-wrap">
													{text}
												</p>
											) : null}
										</div>
									</div>
								);
							})}
						</CardBody>
					</Card>
				) : null}
			</div>
		</div>
	);
}
