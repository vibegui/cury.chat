import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

type Variant = "default" | "outline" | "ghost" | "primary" | "destructive";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
	default: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
	outline: "border border-border bg-transparent hover:bg-secondary",
	ghost: "bg-transparent hover:bg-secondary",
	primary: "bg-primary text-primary-foreground hover:opacity-90",
	destructive: "bg-destructive text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
	sm: "h-8 px-3 text-xs",
	md: "h-9 px-4 text-sm",
	lg: "h-10 px-5 text-base",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

export function Button({
	className,
	variant = "default",
	size = "md",
	disabled,
	children,
	...rest
}: Props) {
	return (
		<button
			type="button"
			disabled={disabled}
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:opacity-50 disabled:pointer-events-none",
				VARIANTS[variant],
				SIZES[size],
				className,
			)}
			{...rest}
		>
			{children}
		</button>
	);
}
