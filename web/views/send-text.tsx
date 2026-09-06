// Inline + fullscreen view for send_text. When the tool already ran (the
// host opened us with toolResult populated), show a confirmation card. When
// the user lands on the fullscreen route directly, show a compose form.

import { CheckCircle2, MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { useCallTool, useMcpHostContext, useMcpState } from "../context";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardBody, CardHeader } from "../components/card";
import { ViewHeader } from "../components/view-header";
import { cn } from "../lib/utils";
import { formatPhone } from "../lib/format";

interface SendTextInput {
	to: string;
	text: string;
}

interface MetaSendResult {
	messaging_product?: string;
	contacts?: Array<{ wa_id: string }>;
	messages?: Array<{ id: string }>;
}

export function SendTextView() {
	const { toolInput, toolResult, status } = useMcpState<SendTextInput, MetaSendResult>();
	const host = useMcpHostContext();
	const fullscreen = host?.displayMode === "fullscreen";
	const callTool = useCallTool();

	const [to, setTo] = useState("");
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// CASE A — the host already executed send_text. Show a confirmation card.
	if (toolInput && toolResult) {
		return (
			<div className={cn(fullscreen ? "p-6 max-w-2xl mx-auto" : "p-3")}>
				<Card>
					<CardHeader className="flex items-center gap-2">
						<CheckCircle2 className="size-4 text-emerald-500" />
						<span className="font-medium">Message sent</span>
						<Badge variant="muted">{formatPhone(toolInput.to)}</Badge>
					</CardHeader>
					<CardBody className="space-y-2">
						<div className="text-sm whitespace-pre-wrap bg-secondary/40 rounded p-3">
							{toolInput.text}
						</div>
						{toolResult.messages?.[0]?.id ? (
							<div className="text-[10px] font-mono text-muted-foreground">
								wamid {toolResult.messages[0].id}
							</div>
						) : null}
					</CardBody>
				</Card>
			</div>
		);
	}

	if (status === "tool-input" && toolInput) {
		return (
			<div className={cn(fullscreen ? "p-6 max-w-2xl mx-auto" : "p-3")}>
				<Card>
					<CardHeader className="flex items-center gap-2">
						<span className="size-3 border-2 border-muted border-t-primary rounded-full animate-spin" />
						<span className="font-medium">Sending…</span>
						<Badge variant="muted">{formatPhone(toolInput.to)}</Badge>
					</CardHeader>
					<CardBody>
						<div className="text-sm whitespace-pre-wrap bg-secondary/40 rounded p-3">
							{toolInput.text}
						</div>
					</CardBody>
				</Card>
			</div>
		);
	}

	// CASE B — manual compose form (fullscreen lands here from the admin canvas).
	async function submit() {
		setError(null);
		const digits = to.replace(/[^\d]/g, "");
		if (!digits) {
			setError("Recipient phone number required (digits only).");
			return;
		}
		if (!text.trim()) {
			setError("Message body required.");
			return;
		}
		setBusy(true);
		try {
			await callTool("send_text", { to: digits, text });
			setSentTo(digits);
			setText("");
		} catch (err: any) {
			setError(err?.message ?? "Failed to send");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={cn(fullscreen ? "p-6 max-w-2xl mx-auto space-y-4" : "p-3 space-y-3")}>
			{fullscreen ? (
				<ViewHeader
					title="Send a manual message"
					subtitle="Sent as the bot to the recipient. Use only inside a 24-hour conversation window — Meta blocks free-form text outside that window unless you use a Template."
				/>
			) : (
				<header className="space-y-1">
					<h1 className="text-sm font-medium">Send a manual message</h1>
					<p className="text-xs text-muted-foreground">
						Sent as the bot. Use only inside a 24-hour conversation window.
					</p>
				</header>
			)}

			{sentTo ? (
				<Card>
					<CardBody className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
						<CheckCircle2 className="size-4" />
						Sent to {formatPhone(sentTo)}.
					</CardBody>
				</Card>
			) : null}

			<Card>
				<CardBody className="space-y-3">
					<div className="space-y-1">
						<label htmlFor="send-to" className="text-xs font-medium text-muted-foreground">
							Recipient (digits only, e.g. 5521988447814)
						</label>
						<input
							id="send-to"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							placeholder="5521988447814"
							className="w-full h-9 rounded border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<label htmlFor="send-text" className="text-xs font-medium text-muted-foreground">
							Message
						</label>
						<textarea
							id="send-text"
							value={text}
							onChange={(e) => setText(e.target.value)}
							placeholder="Hello…"
							rows={5}
							className="w-full rounded border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
					{error ? <div className="text-xs text-destructive">{error}</div> : null}
					<div className="flex items-center justify-end gap-2">
						<Button variant="primary" onClick={submit} disabled={busy}>
							{busy ? (
								"Sending…"
							) : (
								<>
									<Send className="size-3.5" /> Send
								</>
							)}
						</Button>
					</div>
				</CardBody>
			</Card>

			<div className="text-xs text-muted-foreground flex items-center gap-1.5">
				<MessageSquare className="size-3" />
				This message does not run through the LLM — it sends verbatim.
			</div>
		</div>
	);
}
