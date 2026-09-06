import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type Variant = "default" | "muted" | "ok" | "warn" | "danger" | "primary";

const STYLES: Record<Variant, string> = {
	default: "bg-secondary text-secondary-foreground",
	muted: "bg-muted text-muted-foreground",
	ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	danger: "bg-destructive/15 text-destructive",
	primary: "bg-primary/15 text-primary",
};

export function Badge({
	children,
	variant = "default",
	className,
}: {
	children: ReactNode;
	variant?: Variant;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
				STYLES[variant],
				className,
			)}
		>
			{children}
		</span>
	);
}

export function Dot({ ok }: { ok: boolean }) {
	return (
		<span
			className={cn("inline-block size-2 rounded-full", ok ? "bg-emerald-500" : "bg-destructive")}
		/>
	);
}
