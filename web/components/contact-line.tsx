// A single-line identity block: optional name + phone + state tag.
// Used by threads-list rows, thread-detail header, admin recent-activity, etc.
// One component, consistent look.

import { Badge } from "./badge";
import { formatPhone } from "../lib/format";
import { parsePhoneOrigin } from "../lib/brazil";
import { cn } from "../lib/utils";

interface Props {
	phone: string;
	name?: string;
	compact?: boolean; // single-line for tight rows
	className?: string;
}

export function ContactLine({ phone, name, compact, className }: Props) {
	const origin = parsePhoneOrigin(phone);

	if (compact) {
		return (
			<div className={cn("flex items-center gap-2 min-w-0", className)}>
				<span className="text-sm truncate">
					{name ? (
						<>
							<span className="font-medium">{name}</span>
							<span className="text-muted-foreground"> · {formatPhone(phone)}</span>
						</>
					) : (
						<span className="font-mono">{formatPhone(phone)}</span>
					)}
				</span>
				{origin.state ? <Badge variant="muted">{origin.state}</Badge> : null}
			</div>
		);
	}

	return (
		<div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
			<div className="flex items-center gap-2 min-w-0">
				<span className="text-sm font-medium truncate">{name ?? formatPhone(phone)}</span>
				{origin.state ? <Badge variant="muted">{origin.state}</Badge> : null}
			</div>
			{name ? (
				<span className="text-[11px] text-muted-foreground font-mono truncate">
					{formatPhone(phone)}
				</span>
			) : null}
		</div>
	);
}
