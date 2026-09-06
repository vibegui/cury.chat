// Shared UI types that mirror the JSON shapes the worker's MCP tools return.

export type Role = "user" | "assistant";

// A grounding passage. New turns carry { source, text, score }; legacy turns
// stored a bare source string — components handle both.
export interface CitationRef {
	source: string;
	text?: string;
	score?: number;
}

export interface Turn {
	role: Role;
	content: string;
	ts: number;
	model?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		cost?: number;
	};
	citations?: Array<string | CitationRef>;
	name?: string;
}

export interface ThreadSummary {
	threadId: string;
	phone: string;
	date: string;
	name?: string;
	// Per-thread aggregates (populated when list_threads is called with
	// aggregates=true, which is the default).
	messages?: number;
	turns?: number;
	totalTokens?: number;
	totalCost?: number;
	lastTs?: number;
	lastUserMessage?: string;
}

export interface ThreadDetailResult {
	threadId: string;
	phone: string;
	contactName?: string;
	length: number;
	turns: Turn[];
}

export interface ThreadsListResult {
	threads: ThreadSummary[];
	cursor?: string;
}

export interface SystemPromptResult {
	source: "kv-override" | "bundled-fallback";
	prompt: string;
}

export interface StatusResult {
	ok: boolean;
	provider: string;
	model: string;
	ragEnabled: boolean;
	autoragInstance: string | null;
	gateway: { account: string; name: string };
	whatsapp: {
		phoneNumberId: string;
		displayPhone?: string;
		verifiedName?: string;
		apiVersion: string;
	};
	secrets: Record<string, boolean>;
}

export interface CorpusDoc {
	key: string;
	prettifiedName: string;
	size: number;
	uploaded: string; // ISO date string
}

export interface CorpusResult {
	docs: CorpusDoc[];
}

export interface DashboardWindow {
	cost: number;
	messages: number;
	uniqueUsers: number;
	days?: number;
}

export interface DashboardResult {
	status: StatusResult;
	windows: {
		today: DashboardWindow;
		week: DashboardWindow;
		month: DashboardWindow;
	};
	daily: Array<{ date: string; cost: number; messages: number; rag: number }>;
	threadsToday: number;
	todayThreads: Array<{
		threadId: string;
		phone: string;
		name?: string;
		messages: number;
		turns: number;
		totalTokens: number;
		totalCost: number;
		lastTs?: number;
		lastUserMessage?: string;
	}>;
	recentTurns: Array<{ threadId: string; phone: string; name?: string; turn: Turn }>;
	corpusCount: number;
	promptSource: SystemPromptResult["source"];
}

export type McpStatus =
	| "initializing"
	| "connected"
	| "tool-input"
	| "tool-result"
	| "tool-cancelled"
	| "error";

export interface McpState<TInput = unknown, TResult = unknown> {
	status: McpStatus;
	toolName?: string;
	error?: string;
	toolInput?: TInput;
	toolResult?: TResult;
}

export const INITIAL_STATE: McpState = { status: "initializing" };
