// MCP tools exposed by this worker as a control plane for the bot.
//
// Each tool has: name, description, JSON-schema input, and an execute fn.
// The MCP JSON-RPC handler in routes/mcp.ts dispatches `tools/call` to these.
//
// Tools read/write the same KV namespaces the inbound pipeline uses, so any
// change here takes effect on the next WhatsApp message — no redeploy.

import { bundledSystemPrompt } from "../ai/system-prompt.ts";
import type { Env } from "../env.ts";
import { type ExportThread, renderThreadsHtml } from "../export/html.ts";
import { threadIdFor } from "../lib/thread-id.ts";
import {
	getContact,
	getContactsMany,
	listThreadKeys,
	loadThread,
	type Turn,
	upsertContact,
} from "../pipeline/persist.ts";
import { prettifySource } from "../pipeline/retrieve.ts";
import { MetaApi } from "../services/meta.ts";

export interface Tool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	_meta?: { ui?: { resourceUri: string } };
	execute: (env: Env, input: any) => Promise<unknown>;
}

export const tools: Tool[] = [
	{
		name: "list_threads",
		description:
			"List conversation threads with per-thread aggregates. Each entry has threadId, phone, date, optional contact name, message count, total cost, last activity timestamp, and a preview of the last user message. Suitable for a sortable table view.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "number", default: 50, description: "Max threads to return (1-1000)" },
				cursor: { type: "string", description: "Pagination cursor from a prior response" },
				aggregates: {
					type: "boolean",
					default: true,
					description: "If true (default), loads each thread to compute messages/cost/lastTs.",
				},
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/threads-list" } },
		execute: async (env, input) => {
			const { limit = 50, cursor, aggregates = true } = input || {};
			const list = await listThreadKeys(env, Math.min(1000, Math.max(1, limit)), cursor);
			const phones = list.threads.map((id) => id.split(":")[0]);
			const contacts = await getContactsMany(env, phones);

			if (!aggregates) {
				return {
					threads: list.threads.map((threadId) => {
						const [phone, date] = threadId.split(":");
						return { threadId, phone, date, name: contacts.get(phone)?.name };
					}),
					cursor: list.cursor,
				};
			}

			// Load all sampled threads in parallel and roll up per-thread totals.
			const loaded = await Promise.all(
				list.threads.map((id) => loadThread(env, id).then((turns) => ({ id, turns }))),
			);
			return {
				threads: loaded.map(({ id, turns }) => {
					const [phone, date] = id.split(":");
					return {
						threadId: id,
						phone,
						date,
						name: contacts.get(phone)?.name ?? turns.find((t) => t.role === "user" && t.name)?.name,
						...aggregateTurns(turns),
					};
				}),
				cursor: list.cursor,
			};
		},
	},
	{
		name: "get_thread",
		description:
			"Get a conversation. Pass either `thread_id` (the `<phone>:<YYYY-MM-DD>` key returned by list_threads) OR `from` + optional `date`. Returns turns with role, content, model, tokens, citations.",
		inputSchema: {
			type: "object",
			properties: {
				thread_id: {
					type: "string",
					description:
						"Full thread id like `5521988447814:2026-05-28`. Easiest when you already have it from list_threads.",
				},
				from: {
					type: "string",
					description:
						"Phone number (digits only, e.g. 5511999999999). Used if thread_id is absent.",
				},
				date: {
					type: "string",
					description: "YYYY-MM-DD (UTC). Used with `from`. Defaults to today.",
				},
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/thread-detail" } },
		execute: async (env, input) => {
			const { thread_id, from, date } = input ?? {};
			let threadId: string;
			if (typeof thread_id === "string" && thread_id.includes(":")) {
				threadId = thread_id;
			} else if (from) {
				threadId = date ? `${from}:${date}` : threadIdFor(from);
			} else {
				throw new Error("Pass either `thread_id` or `from`.");
			}
			const phone = threadId.split(":")[0];
			const [turns, contact] = await Promise.all([
				loadThread(env, threadId),
				getContact(env, phone),
			]);
			// Fallback: if no contact registry entry yet, scan turns for a name.
			const fallbackName = contact?.name ?? turns.find((t) => t.role === "user" && t.name)?.name;
			return {
				threadId,
				phone,
				contactName: fallbackName,
				length: turns.length,
				turns,
			};
		},
	},
	{
		name: "export_threads_html",
		description:
			"Render one or more conversation threads into a single self-contained HTML file (inline CSS, no external assets, no JS). Deterministic template — no LLM in the rendering path. Agents that want commentary can pass per-thread `analysis` (markdown: paragraphs, **bold**, *italic*, - lists). Returns `{ html, filename, bytes, threadCount }`. Use to hand the user a polished export in one shot.",
		inputSchema: {
			type: "object",
			required: ["thread_ids"],
			properties: {
				thread_ids: {
					type: "array",
					items: { type: "string" },
					description: "Full thread ids like `5521988447814:2026-05-28`. Order is preserved.",
				},
				title: { type: "string", description: "Overrides the default document title." },
				subtitle: {
					type: "string",
					description: "Overrides the default subtitle under the title.",
				},
				intro: {
					type: "string",
					description:
						"Optional markdown rendered as an executive-summary block before per-thread analysis.",
				},
				per_thread: {
					type: "array",
					description: "Per-thread overrides, keyed by thread_id.",
					items: {
						type: "object",
						required: ["thread_id"],
						properties: {
							thread_id: { type: "string" },
							title: {
								type: "string",
								description: "Heading override (defaults to contact name).",
							},
							subtitle: { type: "string", description: "Tagline shown next to the heading." },
							analysis: {
								type: "string",
								description: "Markdown commentary rendered in the Análise block for this thread.",
							},
						},
					},
				},
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/export-result" } },
		execute: async (env, input) => {
			const ids = Array.isArray(input?.thread_ids) ? (input.thread_ids as string[]) : [];
			if (ids.length === 0) throw new Error("thread_ids must contain at least one id");

			const perThreadMap = new Map<
				string,
				{ title?: string; subtitle?: string; analysis?: string }
			>();
			for (const p of (input?.per_thread ?? []) as Array<{
				thread_id: string;
				title?: string;
				subtitle?: string;
				analysis?: string;
			}>) {
				if (p?.thread_id) {
					perThreadMap.set(p.thread_id, {
						title: p.title,
						subtitle: p.subtitle,
						analysis: p.analysis,
					});
				}
			}

			const phones = [...new Set(ids.map((id) => id.split(":")[0]))];
			const [loaded, contacts, allKeys] = await Promise.all([
				Promise.all(ids.map((id) => loadThread(env, id).then((turns) => ({ id, turns })))),
				getContactsMany(env, phones),
				listThreadKeys(env, 1000)
					.then((r) => r.threads.length)
					.catch(() => undefined as number | undefined),
			]);

			const threads: ExportThread[] = loaded.map(({ id, turns }) => {
				const [phone, date] = id.split(":");
				const override = perThreadMap.get(id);
				const fallbackName =
					contacts.get(phone)?.name ?? turns.find((t) => t.role === "user" && t.name)?.name;
				return {
					threadId: id,
					phone,
					date,
					contactName: fallbackName,
					turns,
					title: override?.title,
					subtitle: override?.subtitle,
					analysis: override?.analysis,
				};
			});

			const html = renderThreadsHtml({
				threads,
				title: input?.title,
				subtitle: input?.subtitle,
				intro: input?.intro,
				model: env.LLM_MODEL,
				totalThreadsInSystem: allKeys,
			});

			const stamp = new Date().toISOString().slice(0, 10);
			const filename = `cury-export-${stamp}.html`;
			return {
				html,
				filename,
				bytes: new TextEncoder().encode(html).length,
				threadCount: threads.length,
			};
		},
	},
	{
		name: "get_system_prompt",
		description:
			"Get the active system prompt. Falls back to the bundled prompt if no live override is set in KV.",
		inputSchema: { type: "object", properties: {} },
		_meta: { ui: { resourceUri: "ui://cury/system-prompt" } },
		execute: async (env) => {
			const override = await env.CONFIG.get("system-prompt");
			return {
				source: override ? "kv-override" : "bundled-fallback",
				prompt: override?.trim() || bundledSystemPrompt(),
			};
		},
	},
	{
		name: "set_system_prompt",
		description:
			"Set a live override for the system prompt. Takes effect on the next message. Pass empty string to remove the override and fall back to the bundled prompt.",
		inputSchema: {
			type: "object",
			required: ["prompt"],
			properties: {
				prompt: { type: "string", description: "Full system-prompt text. Empty string clears." },
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/system-prompt" } },
		execute: async (env, input) => {
			const next = (input?.prompt ?? "").trim();
			if (!next) {
				await env.CONFIG.delete("system-prompt");
				return { ok: true, source: "bundled-fallback" };
			}
			await env.CONFIG.put("system-prompt", next);
			return { ok: true, source: "kv-override", length: next.length };
		},
	},
	{
		name: "send_text",
		description:
			"Send a plain-text WhatsApp message from the bot's bound number. Use for proactive outreach or manual replies. Requires META_ACCESS_TOKEN secret.",
		inputSchema: {
			type: "object",
			required: ["to", "text"],
			properties: {
				to: { type: "string", description: "Recipient phone number (digits only, no + or spaces)" },
				text: { type: "string", description: "Message body (≤ 4096 chars)" },
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/send-text" } },
		execute: async (env, input) => {
			if (!env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN not set");
			const meta = new MetaApi({
				phoneNumberId: env.META_PHONE_NUMBER_ID,
				accessToken: env.META_ACCESS_TOKEN,
				apiVersion: env.META_API_VERSION,
			});
			return meta.sendTextMessage(input.to, input.text);
		},
	},
	{
		name: "get_status",
		description: "Return worker health, active model, RAG status, and configured phone number id.",
		inputSchema: { type: "object", properties: {} },
		_meta: { ui: { resourceUri: "ui://cury/status" } },
		execute: async (env) => buildStatus(env),
	},
	{
		name: "list_corpus",
		description:
			"List documents in the knowledge-base R2 bucket (cury-corpus). Returns key, prettified name, size, and last-modified for each.",
		inputSchema: {
			type: "object",
			properties: {
				prefix: { type: "string", description: "Optional R2 key prefix to filter by" },
				limit: { type: "number", default: 200, description: "Max results (1-1000)" },
			},
		},
		_meta: { ui: { resourceUri: "ui://cury/corpus" } },
		execute: async (env, input) => {
			const limit = Math.min(1000, Math.max(1, input?.limit ?? 200));
			const prefix = typeof input?.prefix === "string" ? input.prefix : undefined;
			const list = await env.CORPUS.list({ prefix, limit });
			return {
				docs: list.objects.map((o) => ({
					key: o.key,
					prettifiedName: prettifySource(o.key),
					size: o.size,
					uploaded: o.uploaded.toISOString(),
				})),
				truncated: list.truncated,
			};
		},
	},
	{
		name: "get_dashboard",
		description:
			"Aggregated control-plane snapshot for the admin UI: live status, today's activity, recent turns, corpus count, prompt source.",
		inputSchema: { type: "object", properties: {} },
		_meta: { ui: { resourceUri: "ui://cury/admin" } },
		execute: async (env) => {
			const [status, threadList, corpus, promptOverride] = await Promise.all([
				buildStatus(env),
				listThreadKeys(env, 1000),
				env.CORPUS.list({ limit: 1000 }).catch(() => ({ objects: [] as Array<unknown> })),
				env.CONFIG.get("system-prompt"),
			]);

			const today = todayUtcDate();
			const weekDates = new Set(lastNUtcDates(7));
			const monthDates = new Set(lastNUtcDates(30));
			const sparklineDates = lastNUtcDates(14); // newest first
			const todayThreadIds = threadList.threads.filter((id) => id.endsWith(`:${today}`));

			// Load up to 200 of the last 30 days' threads in one pass — covers both
			// today's per-thread aggregates and the week/month rollups without
			// double-fetching today. Cap keeps a worst-case dashboard call bounded
			// (~200 KV reads in parallel).
			const monthThreadIds = threadList.threads.filter((id) => {
				const date = id.split(":")[1];
				return date && monthDates.has(date);
			});
			const monthLoaded = await Promise.all(
				monthThreadIds
					.slice(0, 200)
					.map((id) => loadThread(env, id).then((turns) => ({ id, turns }))),
			);

			// Per-day buckets for the 14-day sparkline. `rag` = number of bot replies
			// that day that were grounded in retrieved passages (had ≥1 citation).
			const dailyBuckets = new Map<string, { cost: number; messages: number; rag: number }>();
			for (const date of sparklineDates) dailyBuckets.set(date, { cost: 0, messages: 0, rag: 0 });

			let todayCost = 0;
			let todayMessages = 0;
			let weekCost = 0;
			let weekMessages = 0;
			let monthCost = 0;
			let monthMessages = 0;
			const todayUsers = new Set<string>();
			const weekUsers = new Set<string>();
			const monthUsers = new Set<string>();
			const allTurns: Array<{ threadId: string; turn: Turn }> = [];
			const loadedToday: Array<{ id: string; turns: Turn[] }> = [];

			for (const { id, turns } of monthLoaded) {
				const [phone, date] = id.split(":");
				if (!date) continue;
				const cost = sumTurnsCost(turns);
				const userMsgs = turns.reduce((n, t) => (t.role === "user" ? n + 1 : n), 0);
				const ragReplies = turns.reduce(
					(n, t) => (t.role === "assistant" && t.citations?.length ? n + 1 : n),
					0,
				);

				monthCost += cost;
				monthMessages += userMsgs;
				if (turns.length > 0) monthUsers.add(phone);

				if (weekDates.has(date)) {
					weekCost += cost;
					weekMessages += userMsgs;
					if (turns.length > 0) weekUsers.add(phone);
				}

				const bucket = dailyBuckets.get(date);
				if (bucket) {
					bucket.cost += cost;
					bucket.messages += userMsgs;
					bucket.rag += ragReplies;
				}

				if (date === today) {
					loadedToday.push({ id, turns });
					todayCost += cost;
					todayMessages += userMsgs;
					if (turns.length > 0) todayUsers.add(phone);
					for (const t of turns) allTurns.push({ threadId: id, turn: t });
				}
			}

			// Lazy backfill: for any user turn that carries a name but isn't yet in
			// the contact registry, write it now. Fire-and-forget; failures are
			// harmless (the next inbound message will retry).
			for (const { id, turns } of loadedToday) {
				const phone = id.split(":")[0];
				const named = turns.find((t) => t.role === "user" && t.name);
				if (named?.name) {
					upsertContact(env, phone, named.name).catch(() => {});
				}
			}

			const recentTurns = allTurns.sort((a, b) => b.turn.ts - a.turn.ts).slice(0, 5);

			// Hydrate names for both the recent-turns view and the today threads.
			const phonesToLookup = new Set<string>();
			for (const id of todayThreadIds) phonesToLookup.add(id.split(":")[0]);
			for (const { threadId } of recentTurns) phonesToLookup.add(threadId.split(":")[0]);
			const contacts = await getContactsMany(env, [...phonesToLookup]);

			// Build per-thread aggregates from the same `loadedToday` data we just rolled up.
			const todayAggregates = new Map<string, ReturnType<typeof aggregateTurns>>();
			for (const { id, turns } of loadedToday) {
				todayAggregates.set(id, aggregateTurns(turns));
			}

			// Reverse so the sparkline reads left-to-right (oldest → today).
			const daily = [...sparklineDates].reverse().map((date) => ({
				date,
				cost: dailyBuckets.get(date)?.cost ?? 0,
				messages: dailyBuckets.get(date)?.messages ?? 0,
				rag: dailyBuckets.get(date)?.rag ?? 0,
			}));

			return {
				status,
				windows: {
					today: { cost: todayCost, messages: todayMessages, uniqueUsers: todayUsers.size },
					week: { cost: weekCost, messages: weekMessages, uniqueUsers: weekUsers.size, days: 7 },
					month: {
						cost: monthCost,
						messages: monthMessages,
						uniqueUsers: monthUsers.size,
						days: 30,
					},
				},
				daily,
				threadsToday: todayThreadIds.length,
				todayThreads: todayThreadIds.map((threadId) => {
					const phone = threadId.split(":")[0];
					const agg = todayAggregates.get(threadId);
					return {
						threadId,
						phone,
						name: contacts.get(phone)?.name,
						messages: agg?.messages ?? 0,
						turns: agg?.turns ?? 0,
						totalCost: agg?.totalCost ?? 0,
						totalTokens: agg?.totalTokens ?? 0,
						lastTs: agg?.lastTs,
						lastUserMessage: agg?.lastUserMessage,
					};
				}),
				recentTurns: recentTurns.map(({ threadId, turn }) => {
					const phone = threadId.split(":")[0];
					return { threadId, phone, name: contacts.get(phone)?.name, turn };
				}),
				corpusCount: corpus.objects.length,
				promptSource: promptOverride ? "kv-override" : "bundled-fallback",
			};
		},
	},
];

/**
 * Roll up per-thread statistics from its turns. Shared between list_threads
 * and get_dashboard so both surface the same numbers.
 */
function aggregateTurns(turns: Turn[]) {
	let messages = 0;
	let totalTokens = 0;
	let totalCost = 0;
	let lastTs: number | undefined;
	let lastUserMessage: string | undefined;
	for (const t of turns) {
		if (t.role === "user") {
			messages += 1;
			lastUserMessage = t.content;
		}
		if (t.usage?.total_tokens) totalTokens += t.usage.total_tokens;
		if (typeof t.usage?.cost === "number") totalCost += t.usage.cost;
		if (!lastTs || t.ts > lastTs) lastTs = t.ts;
	}
	return {
		turns: turns.length,
		messages,
		totalTokens,
		totalCost,
		lastTs,
		lastUserMessage: lastUserMessage ? lastUserMessage.slice(0, 140) : undefined,
	};
}

function todayUtcDate(now: Date = new Date()): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** UTC date strings for the last `n` days, newest first (index 0 = today). */
function lastNUtcDates(n: number, now: Date = new Date()): string[] {
	const out: string[] = [];
	for (let i = 0; i < n; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() - i);
		out.push(todayUtcDate(d));
	}
	return out;
}

function sumTurnsCost(turns: Turn[]): number {
	let c = 0;
	for (const t of turns) {
		if (typeof t.usage?.cost === "number") c += t.usage.cost;
	}
	return c;
}

// Cache the Meta phone-number profile (display number + verified name) so we
// don't hit graph.facebook.com on every status call. 24h TTL — these change
// extremely rarely; users who re-bind a number can `wrangler kv key delete`
// the cache to force a refresh.
const META_PROFILE_KEY = "meta:profile";
const META_PROFILE_TTL = 60 * 60 * 24;

async function fetchMetaProfile(env: Env): Promise<{
	displayPhone?: string;
	verifiedName?: string;
}> {
	if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) return {};

	const cached = await env.CONFIG.get(META_PROFILE_KEY);
	if (cached) {
		try {
			return JSON.parse(cached);
		} catch {
			// fall through to refetch
		}
	}

	try {
		const res = await fetch(
			`https://graph.facebook.com/${env.META_API_VERSION}/${env.META_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`,
			{ headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } },
		);
		if (!res.ok) return {};
		const json = (await res.json()) as {
			display_phone_number?: string;
			verified_name?: string;
		};
		const profile = {
			displayPhone: json.display_phone_number,
			verifiedName: json.verified_name,
		};
		await env.CONFIG.put(META_PROFILE_KEY, JSON.stringify(profile), {
			expirationTtl: META_PROFILE_TTL,
		});
		return profile;
	} catch {
		return {};
	}
}

async function buildStatus(env: Env) {
	const [profile, autorag] = await Promise.all([fetchMetaProfile(env), autoragStats(env)]);
	return {
		ok: true,
		provider: env.LLM_PROVIDER,
		model: env.LLM_MODEL,
		ragEnabled: !!env.AUTORAG_INSTANCE,
		autoragInstance: env.AUTORAG_INSTANCE || null,
		autorag,
		gateway: { account: env.AI_GATEWAY_ACCOUNT_ID, name: env.AI_GATEWAY_NAME },
		whatsapp: {
			phoneNumberId: env.META_PHONE_NUMBER_ID,
			displayPhone: profile.displayPhone,
			verifiedName: profile.verifiedName,
			apiVersion: env.META_API_VERSION,
		},
		secrets: {
			CF_AI_GATEWAY_TOKEN: !!env.CF_AI_GATEWAY_TOKEN,
			OPENROUTER_API_KEY: !!env.OPENROUTER_API_KEY,
			META_ACCESS_TOKEN: !!env.META_ACCESS_TOKEN,
			META_APP_SECRET: !!env.META_APP_SECRET,
			META_VERIFY_TOKEN: !!env.META_VERIFY_TOKEN,
		},
	};
}

// AI Search index health — confirms the corpus is actually indexed (vectorsCount)
// and surfaces indexing status. Best-effort: returns null if the binding is
// absent or the call fails, so get_status never breaks on it.
async function autoragStats(env: Env): Promise<unknown> {
	if (!env.AUTORAG_INSTANCE?.trim() || !env.AUTORAG) return null;
	try {
		const s = await env.AUTORAG.stats();
		return {
			vectorsCount: s.engine?.vectorize?.vectorsCount ?? null,
			dimensions: s.engine?.vectorize?.dimensions ?? null,
			indexedItems: s.engine?.r2?.objectCount ?? null,
			completed: s.completed ?? null,
			queued: s.queued ?? null,
			running: s.running ?? null,
			error: s.error ?? null,
			outdated: s.outdated ?? null,
			lastActivity: s.last_activity ?? null,
		};
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

// Quick lookup by name.
export const toolByName: Record<string, Tool> = Object.fromEntries(tools.map((t) => [t.name, t]));
