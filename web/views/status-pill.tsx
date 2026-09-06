// Inline view for get_status — a compact health pill.
// Fullscreen mode redirects to the admin canvas.

import { CheckCircle2, XCircle } from "lucide-react";
import { useMcpHostContext, useMcpState } from "../context";
import { Badge, Dot } from "../components/badge";
import { Card, CardBody, CardHeader } from "../components/card";
import { ViewHeader } from "../components/view-header";
import { prettifyModel } from "../lib/format";
import type { StatusResult } from "../types";

export function StatusPillView() {
	const { toolResult, status } = useMcpState<unknown, StatusResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";

	if (status === "tool-input") {
		return <Loading />;
	}
	if (!toolResult) {
		return <Loading />;
	}

	const s = toolResult;
	const phone = s.whatsapp.displayPhone ?? "(loading…)";

	if (!fullscreen) {
		// INLINE — single line of badges
		return (
			<div className="p-3 flex flex-wrap items-center gap-2 text-sm">
				<Dot ok={s.ok} />
				<span className="font-medium">{prettifyModel(s.model)}</span>
				<Badge variant={s.ragEnabled ? "ok" : "warn"}>{s.ragEnabled ? "RAG on" : "RAG off"}</Badge>
				<Badge variant="muted">{phone}</Badge>
			</div>
		);
	}

	// FULLSCREEN — more detail in a card
	return (
		<div className="p-6 max-w-3xl mx-auto space-y-4">
			<ViewHeader title="Status" subtitle="Live config snapshot from the Worker." />

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Dot ok={s.ok} />
							<span className="font-medium">{s.ok ? "Operational" : "Down"}</span>
						</div>
						<Badge variant={s.ragEnabled ? "ok" : "warn"}>
							{s.ragEnabled ? `RAG: ${s.autoragInstance ?? "?"}` : "RAG off"}
						</Badge>
					</div>
				</CardHeader>
				<CardBody className="grid grid-cols-2 gap-3 text-sm">
					<Field label="Provider" value={s.provider} />
					<Field label="Model" value={prettifyModel(s.model)} />
					<Field label="Phone" value={phone} />
					{s.whatsapp.verifiedName ? (
						<Field label="Verified name" value={s.whatsapp.verifiedName} />
					) : null}
					<Field label="Phone number id" value={s.whatsapp.phoneNumberId} />
					<Field label="API version" value={s.whatsapp.apiVersion} />
					<Field label="Gateway" value={`${s.gateway.name} (${shortAcct(s.gateway.account)})`} />
				</CardBody>
			</Card>

			<Card>
				<CardHeader>
					<h2 className="font-medium">Secrets</h2>
				</CardHeader>
				<CardBody className="grid grid-cols-2 gap-2 text-sm">
					{Object.entries(s.secrets).map(([name, present]) => (
						<div key={name} className="flex items-center gap-2">
							{present ? (
								<CheckCircle2 className="size-4 text-emerald-500" />
							) : (
								<XCircle className="size-4 text-muted-foreground" />
							)}
							<span className="font-mono text-xs">{name}</span>
						</div>
					))}
				</CardBody>
			</Card>
		</div>
	);
}

function Loading() {
	return (
		<div className="p-3 flex items-center gap-2 text-sm text-muted-foreground">
			<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
			Checking status…
		</div>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="font-mono text-xs break-all">{value}</span>
		</div>
	);
}

function shortAcct(id: string): string {
	if (id.length <= 12) return id;
	return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
