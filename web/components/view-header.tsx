// Shared header for the non-admin views — title + optional back-to-dashboard
// button. Used in fullscreen mode where the user navigated in from the admin
// canvas and needs an obvious way back.

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useCallTool } from "../context";
import { Button } from "./button";

interface Props {
	title: string;
	subtitle?: ReactNode;
	right?: ReactNode;
	// Custom back action. Defaults to navigating to the dashboard. Views that
	// have an in-view "open" state (e.g. the thread list opening a thread inline)
	// pass their own handler so back returns to that list, not all the way home.
	onBack?: () => void;
}

export function ViewHeader({ title, subtitle, right, onBack }: Props) {
	const callTool = useCallTool();
	return (
		<header className="flex items-start justify-between gap-3 flex-wrap mb-3">
			<div className="flex items-center gap-2 min-w-0">
				<Button
					size="sm"
					variant="ghost"
					onClick={onBack ?? (() => callTool("get_dashboard"))}
					title={onBack ? "Back" : "Back to dashboard"}
					className="-ml-2"
				>
					<ArrowLeft className="size-3.5" />
				</Button>
				<div className="space-y-0.5 min-w-0">
					<h1 className="text-lg font-semibold truncate">{title}</h1>
					{subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
				</div>
			</div>
			{right ? <div className="flex items-center gap-2 flex-wrap">{right}</div> : null}
		</header>
	);
}
