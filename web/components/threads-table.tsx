// Sortable table of threads. Used by AdminView (today) and ThreadsListView (all).
//
// Columns: contact (name + phone + state), messages, tokens, cost, last activity,
// optional preview of the last user message. Click a header to toggle sort.

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCost, formatTimeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import type { ThreadSummary } from "../types";
import { Badge } from "./badge";
import { ContactLine } from "./contact-line";

type SortKey = "lastTs" | "messages" | "totalCost" | "totalTokens" | "name" | "date";
type SortDir = "asc" | "desc";

interface Props {
	threads: ThreadSummary[];
	onOpen: (threadId: string) => void;
	showPreview?: boolean;
	showDate?: boolean;
	emptyHint?: React.ReactNode;
	className?: string;
	selectable?: boolean;
	selected?: Set<string>;
	onToggleSelected?: (threadId: string) => void;
	onToggleAll?: (next: boolean) => void;
}

export function ThreadsTable({
	threads,
	onOpen,
	showPreview = true,
	showDate = false,
	emptyHint,
	className,
	selectable = false,
	selected,
	onToggleSelected,
	onToggleAll,
}: Props) {
	const [sortKey, setSortKey] = useState<SortKey>("lastTs");
	const [sortDir, setSortDir] = useState<SortDir>("desc");

	const sorted = useMemo(() => {
		const arr = [...threads];
		arr.sort((a, b) => {
			const av = pick(a, sortKey);
			const bv = pick(b, sortKey);
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			if (typeof av === "number" && typeof bv === "number") {
				return sortDir === "asc" ? av - bv : bv - av;
			}
			const cmp = String(av).localeCompare(String(bv));
			return sortDir === "asc" ? cmp : -cmp;
		});
		return arr;
	}, [threads, sortKey, sortDir]);

	function toggle(k: SortKey) {
		if (sortKey === k) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(k);
			setSortDir(k === "name" ? "asc" : "desc");
		}
	}

	if (threads.length === 0 && emptyHint) {
		return <div className={className}>{emptyHint}</div>;
	}

	const allSelected =
		selectable &&
		selected !== undefined &&
		threads.length > 0 &&
		threads.every((t) => selected.has(t.threadId));
	const someSelected =
		selectable && selected !== undefined && threads.some((t) => selected.has(t.threadId));

	return (
		<div className={cn("rounded-lg border border-border overflow-x-auto", className)}>
			<table className="w-full text-sm">
				<thead className="bg-secondary/40 text-xs">
					<tr>
						{selectable ? (
							<th className="px-3 py-2 w-10">
								<input
									type="checkbox"
									aria-label={allSelected ? "Unselect all" : "Select all"}
									checked={allSelected}
									ref={(el) => {
										if (el) el.indeterminate = !allSelected && someSelected;
									}}
									onChange={(e) => onToggleAll?.(e.target.checked)}
									onClick={(e) => e.stopPropagation()}
									className="cursor-pointer"
								/>
							</th>
						) : null}
						<Th k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggle}>
							Contact
						</Th>
						<Th
							k="messages"
							sortKey={sortKey}
							sortDir={sortDir}
							onClick={toggle}
							className="text-right w-20"
						>
							Msgs
						</Th>
						<Th
							k="totalTokens"
							sortKey={sortKey}
							sortDir={sortDir}
							onClick={toggle}
							className="text-right w-24 hidden sm:table-cell"
						>
							Tokens
						</Th>
						<Th
							k="totalCost"
							sortKey={sortKey}
							sortDir={sortDir}
							onClick={toggle}
							className="text-right w-20"
						>
							Cost
						</Th>
						<Th
							k="lastTs"
							sortKey={sortKey}
							sortDir={sortDir}
							onClick={toggle}
							className="text-right w-28 hidden min-[420px]:table-cell"
						>
							Last
						</Th>
						{showDate ? (
							<Th
								k="date"
								sortKey={sortKey}
								sortDir={sortDir}
								onClick={toggle}
								className="text-right w-28 hidden md:table-cell"
							>
								Date
							</Th>
						) : null}
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{sorted.map((t) => (
						<tr
							key={t.threadId}
							onClick={() => onOpen(t.threadId)}
							title="Open thread"
							className={cn(
								"thread-row hover:bg-secondary/30 transition-colors cursor-pointer",
								selectable && selected?.has(t.threadId) ? "bg-primary/5" : null,
							)}
						>
							{selectable ? (
								// Select cell: clicking anywhere here only toggles selection
								// (and never opens the thread / never underlines the title).
								<td
									className="thread-select px-3 py-2 w-10 cursor-pointer"
									onClick={(e) => {
										e.stopPropagation();
										onToggleSelected?.(t.threadId);
									}}
								>
									<input
										type="checkbox"
										aria-label="Select thread"
										checked={selected?.has(t.threadId) ?? false}
										onChange={() => onToggleSelected?.(t.threadId)}
										onClick={(e) => e.stopPropagation()}
										className="cursor-pointer"
									/>
								</td>
							) : null}
							<td className="px-3 py-2 min-w-0 max-w-0">
								<div className="space-y-0.5 min-w-0">
									<span className="thread-title">
										<ContactLine phone={t.phone} name={t.name} compact />
									</span>
									{showPreview && t.lastUserMessage ? (
										<div className="text-[11px] text-muted-foreground truncate max-w-md">
											{t.lastUserMessage}
										</div>
									) : null}
								</div>
							</td>
							<td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
								{t.messages ?? 0}
							</td>
							<td className="px-3 py-2 text-right font-mono text-xs tabular-nums hidden sm:table-cell">
								{(t.totalTokens ?? 0).toLocaleString()}
							</td>
							<td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
								{formatCost(t.totalCost)}
							</td>
							<td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums hidden min-[420px]:table-cell">
								{t.lastTs ? formatTimeAgo(t.lastTs) : "—"}
							</td>
							{showDate ? (
								<td className="px-3 py-2 text-right text-xs font-mono text-muted-foreground hidden md:table-cell">
									{t.date}
								</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function pick(t: ThreadSummary, k: SortKey): number | string | undefined {
	switch (k) {
		case "lastTs":
			return t.lastTs;
		case "messages":
			return t.messages ?? 0;
		case "totalCost":
			return t.totalCost ?? 0;
		case "totalTokens":
			return t.totalTokens ?? 0;
		case "name":
			return t.name ?? t.phone;
		case "date":
			return t.date;
	}
}

function Th({
	k,
	sortKey,
	sortDir,
	onClick,
	className,
	children,
}: {
	k: SortKey;
	sortKey: SortKey;
	sortDir: SortDir;
	onClick: (k: SortKey) => void;
	className?: string;
	children: React.ReactNode;
}) {
	const active = sortKey === k;
	return (
		<th
			className={cn(
				"px-3 py-2 font-medium text-muted-foreground select-none cursor-pointer text-left",
				className,
			)}
			onClick={() => onClick(k)}
		>
			<span className="inline-flex items-center gap-1">
				{children}
				{active ? (
					sortDir === "asc" ? (
						<ArrowUp className="size-3" />
					) : (
						<ArrowDown className="size-3" />
					)
				) : (
					<ChevronsUpDown className="size-3 opacity-30" />
				)}
			</span>
		</th>
	);
}
