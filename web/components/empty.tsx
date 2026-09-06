import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function EmptyState({
	icon,
	title,
	children,
	className,
}: {
	icon?: ReactNode;
	title: string;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 text-center text-muted-foreground p-6",
				className,
			)}
		>
			{icon ? <div className="mb-1 opacity-60">{icon}</div> : null}
			<div className="text-sm font-medium text-foreground">{title}</div>
			{children ? <div className="text-xs max-w-sm">{children}</div> : null}
		</div>
	);
}
