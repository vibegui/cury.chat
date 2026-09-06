// A tiny bar-chart sparkline rendered inline as SVG (no chart library).
// Used by the admin dashboard to visualize daily cost and message volume
// over the last N days.

interface Props {
	data: Array<{ date: string; value: number }>;
	format?: (v: number) => string;
	ariaLabel: string;
	className?: string;
}

const VIEW_W = 100;
const VIEW_H = 32;
const GAP_FRAC = 0.2;
const MIN_BAR_H = 0.4; // so empty days still render as a faint baseline tick

export function Sparkline({ data, format, ariaLabel, className }: Props) {
	const max = data.reduce((m, d) => (d.value > m ? d.value : m), 0);
	const n = Math.max(data.length, 1);
	const slot = VIEW_W / n;
	const barW = slot * (1 - GAP_FRAC);
	const offset = slot * (GAP_FRAC / 2);

	return (
		<svg
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			preserveAspectRatio="none"
			className={className ?? "w-full h-16"}
			role="img"
			aria-label={ariaLabel}
		>
			{data.map((d, i) => {
				const h = max > 0 ? (d.value / max) * VIEW_H : 0;
				const drawH = Math.max(h, MIN_BAR_H);
				return (
					<rect
						key={d.date}
						x={i * slot + offset}
						y={VIEW_H - drawH}
						width={barW}
						height={drawH}
						className={h > 0 ? "fill-primary/70" : "fill-muted-foreground/20"}
					>
						<title>
							{d.date}: {format ? format(d.value) : d.value.toLocaleString()}
						</title>
					</rect>
				);
			})}
		</svg>
	);
}
