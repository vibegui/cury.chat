import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-card text-card-foreground shadow-sm",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("px-4 pt-3 pb-2", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("px-4 pb-3", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn("border-t border-border px-4 py-2 text-xs text-muted-foreground", className)}
		>
			{children}
		</div>
	);
}
