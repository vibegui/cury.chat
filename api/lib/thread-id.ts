// Conversation threads roll over daily, scoped to a phone number.
// Matches the convention used by the old waba bridge.

export function threadIdFor(from: string, now: Date = new Date()): string {
	return `${from}:${dateStampFor(now)}`;
}

// The UTC day stamp (YYYY-MM-DD) used in thread ids and daily memory entries.
export function dateStampFor(now: Date = new Date()): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
