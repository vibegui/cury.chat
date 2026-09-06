// Small formatting helpers shared across views.

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatTimeAgo(ts: number, now = Date.now()): string {
	const delta = Math.max(0, now - ts);
	const sec = Math.floor(delta / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const days = Math.floor(hr / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

export function formatCost(cost?: number): string {
	if (typeof cost !== "number") return "—";
	if (cost === 0) return "$0";
	if (cost < 0.01) return `${(cost * 100).toFixed(3)}¢`;
	return `$${cost.toFixed(4)}`;
}

export function formatPhone(input: string): string {
	// Input is digits-only international format like "5521988447814".
	// Render as +55 21 9 8844-7814 for BR numbers, fall back to spaced groups.
	if (input.startsWith("55") && (input.length === 12 || input.length === 13)) {
		const cc = input.slice(0, 2);
		const ddd = input.slice(2, 4);
		const rest = input.slice(4);
		if (rest.length === 9) return `+${cc} ${ddd} ${rest[0]} ${rest.slice(1, 5)}-${rest.slice(5)}`;
		if (rest.length === 8) return `+${cc} ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
	}
	return `+${input}`;
}

export function parseThreadId(threadId: string): { phone: string; date: string } | null {
	const i = threadId.indexOf(":");
	if (i < 0) return null;
	return { phone: threadId.slice(0, i), date: threadId.slice(i + 1) };
}

export function prettifyModel(model?: string): string {
	if (!model) return "—";
	// e.g. "deepseek/deepseek-v4-flash-20260423" → "deepseek-v4-flash"
	const slash = model.lastIndexOf("/");
	let m = slash >= 0 ? model.slice(slash + 1) : model;
	// Drop trailing date snapshots like -20260423.
	m = m.replace(/-\d{6,}$/, "");
	return m;
}
