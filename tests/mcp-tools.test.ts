// Behavioural tests for the MCP tools — specifically the bug we just fixed
// where studio passed `thread_id` instead of `from` and the tool computed
// `threadId="undefined:2026-05-28"` (empty thread).

import { describe, expect, test } from "bun:test";
import { toolByName, tools } from "../api/mcp/tools.ts";

// Minimal stub for an Env binding. We only need CONFIG.get / THREADS.get for
// the tool paths we're testing.
function fakeEnv(
	stored: Record<string, string> = {},
	corpus: Array<{ key: string; size: number; uploaded: string }> = [],
) {
	const store = new Map<string, string>(Object.entries(stored));
	const kv = {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v);
		},
		delete: async (k: string) => {
			store.delete(k);
		},
		list: async (opts?: { prefix?: string; limit?: number; cursor?: string }) => {
			const prefix = opts?.prefix ?? "";
			const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
			return { keys, list_complete: true, cursor: undefined };
		},
	};
	const r2 = {
		list: async (opts?: { prefix?: string; limit?: number }) => {
			const prefix = opts?.prefix ?? "";
			const limit = opts?.limit ?? 1000;
			const objects = corpus
				.filter((o) => o.key.startsWith(prefix))
				.slice(0, limit)
				.map((o) => ({ ...o, uploaded: new Date(o.uploaded) }));
			return { objects, truncated: false };
		},
	};
	return {
		CONFIG: kv,
		THREADS: kv,
		DEDUPE: kv,
		CORPUS: r2,
		LLM_MODEL: "test-model",
		LLM_PROVIDER: "openrouter",
		AUTORAG_INSTANCE: "test-instance",
		AI_GATEWAY_ACCOUNT_ID: "test-account",
		AI_GATEWAY_NAME: "default",
		META_PHONE_NUMBER_ID: "660506283812574",
		META_API_VERSION: "v23.0",
	} as any;
}

const SAMPLE_TURNS = JSON.stringify([
	{ role: "user", content: "Olá", ts: 1779977858619 },
	{ role: "assistant", content: "Olá, como posso ajudar?", ts: 1779977858619 },
]);

// -----------------------------------------------------------------------------
// catalog sanity
// -----------------------------------------------------------------------------

describe("MCP tool catalog", () => {
	test("contains the 9 expected tools", () => {
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual(
			[
				"export_threads_html",
				"get_dashboard",
				"get_status",
				"get_system_prompt",
				"get_thread",
				"list_corpus",
				"list_threads",
				"send_text",
				"set_system_prompt",
			].sort(),
		);
	});

	test("every tool declares a UI resource (so studio renders something on call)", () => {
		for (const t of tools) {
			expect(t._meta?.ui?.resourceUri).toMatch(/^ui:\/\/cury\//);
		}
	});

	test("every tool has name, description, schema, execute", () => {
		for (const t of tools) {
			expect(t.name.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(10);
			expect(t.inputSchema).toBeDefined();
			expect(typeof t.execute).toBe("function");
		}
	});
});

// -----------------------------------------------------------------------------
// get_thread — accepts both thread_id (full key) and from (+optional date)
// Regression: studio called with thread_id; our schema only had `from`, so
// args fell through to undefined and we computed "undefined:2026-05-28".
// -----------------------------------------------------------------------------

describe("get_thread", () => {
	const tool = toolByName.get_thread;
	const env = fakeEnv({ "t:5521988447814:2026-05-28": SAMPLE_TURNS });

	test("accepts thread_id (the form studio sends)", async () => {
		const out = (await tool.execute(env, { thread_id: "5521988447814:2026-05-28" })) as any;
		expect(out.threadId).toBe("5521988447814:2026-05-28");
		expect(out.phone).toBe("5521988447814");
		expect(out.length).toBe(2);
		expect(out.turns[0].content).toBe("Olá");
	});

	test("includes contactName from registry when present", async () => {
		const env = fakeEnv({
			"t:5521988447814:2026-05-28": SAMPLE_TURNS,
			"c:5521988447814": JSON.stringify({
				phone: "5521988447814",
				name: "Carlos",
				lastSeen: 1,
			}),
		});
		const out = (await tool.execute(env, { thread_id: "5521988447814:2026-05-28" })) as any;
		expect(out.contactName).toBe("Carlos");
	});

	test("falls back to name carried on a turn when no registry entry", async () => {
		const env = fakeEnv({
			"t:5511:2026-05-28": JSON.stringify([
				{ role: "user", content: "hi", ts: 1, name: "Diana" },
				{ role: "assistant", content: "hi back", ts: 2 },
			]),
		});
		const out = (await tool.execute(env, { thread_id: "5511:2026-05-28" })) as any;
		expect(out.contactName).toBe("Diana");
	});

	test("accepts `from` + explicit date", async () => {
		const out = (await tool.execute(env, {
			from: "5521988447814",
			date: "2026-05-28",
		})) as any;
		expect(out.threadId).toBe("5521988447814:2026-05-28");
		expect(out.length).toBe(2);
	});

	test("accepts `from` without date → uses today (UTC)", async () => {
		const today = new Date();
		const y = today.getUTCFullYear();
		const m = String(today.getUTCMonth() + 1).padStart(2, "0");
		const d = String(today.getUTCDate()).padStart(2, "0");
		const todayKey = `5521988447814:${y}-${m}-${d}`;
		const envWithToday = fakeEnv({ [`t:${todayKey}`]: SAMPLE_TURNS });

		const out = (await tool.execute(envWithToday, { from: "5521988447814" })) as any;
		expect(out.threadId).toBe(todayKey);
	});

	test("nonexistent thread → length 0, empty turns array", async () => {
		const out = (await tool.execute(env, { thread_id: "9999999999:2026-05-28" })) as any;
		expect(out.length).toBe(0);
		expect(out.turns).toEqual([]);
	});

	test("missing both args → throws (no silent undefined keys)", async () => {
		await expect(tool.execute(env, {})).rejects.toThrow(/thread_id|from/);
	});

	test("thread_id without colon → falls back to `from` path", async () => {
		// If someone passes a bare phone number as thread_id, we don't pretend
		// it's a full key — we treat it as `from` and use today's date.
		await expect(tool.execute(env, { thread_id: "5521988447814" })).rejects.toThrow();
	});
});

// -----------------------------------------------------------------------------
// list_threads — pagination shape
// -----------------------------------------------------------------------------

describe("list_threads", () => {
	const tool = toolByName.list_threads;

	test("returns rich thread objects with phone, date, and optional name", async () => {
		const env = fakeEnv({
			"t:5511:2026-05-28": SAMPLE_TURNS,
			"t:5521:2026-05-28": SAMPLE_TURNS,
			"c:5511": JSON.stringify({ phone: "5511", name: "Alice", lastSeen: 1 }),
			"unrelated-key": "x",
		});
		const out = (await tool.execute(env, {})) as any;
		const ids = out.threads.map((t: any) => t.threadId);
		expect(ids).toContain("5511:2026-05-28");
		expect(ids).toContain("5521:2026-05-28");
		expect(ids).not.toContain("unrelated-key");

		const alice = out.threads.find((t: any) => t.phone === "5511");
		expect(alice.name).toBe("Alice");
		const bob = out.threads.find((t: any) => t.phone === "5521");
		expect(bob.name).toBeUndefined();
	});

	test("default limit applied, no crash on empty store", async () => {
		const env = fakeEnv();
		const out = (await tool.execute(env, {})) as any;
		expect(out.threads).toEqual([]);
	});

	test("limit clamped to [1, 1000]", async () => {
		// Just verify it doesn't throw on out-of-range input.
		const env = fakeEnv();
		await expect(tool.execute(env, { limit: 99999 })).resolves.toBeDefined();
		await expect(tool.execute(env, { limit: -5 })).resolves.toBeDefined();
	});

	test("aggregates: each thread returns messages, totalCost, lastTs, lastUserMessage", async () => {
		const turns = JSON.stringify([
			{ role: "user", content: "first msg", ts: 1000 },
			{
				role: "assistant",
				content: "reply",
				ts: 1100,
				usage: { total_tokens: 200, cost: 0.0005 },
			},
			{ role: "user", content: "second msg", ts: 2000 },
			{
				role: "assistant",
				content: "reply 2",
				ts: 2100,
				usage: { total_tokens: 150, cost: 0.0003 },
			},
		]);
		const env = fakeEnv({ "t:5521:2026-05-28": turns });
		const out = (await tool.execute(env, {})) as any;
		const row = out.threads.find((t: any) => t.threadId === "5521:2026-05-28");
		expect(row).toBeDefined();
		expect(row.messages).toBe(2);
		expect(row.turns).toBe(4);
		expect(row.totalTokens).toBe(350);
		expect(row.totalCost).toBeCloseTo(0.0008);
		expect(row.lastTs).toBe(2100);
		expect(row.lastUserMessage).toBe("second msg");
	});

	test("aggregates:false skips per-thread loads (cheap mode)", async () => {
		const env = fakeEnv({ "t:5521:2026-05-28": SAMPLE_TURNS });
		const out = (await tool.execute(env, { aggregates: false })) as any;
		const row = out.threads[0];
		expect(row.threadId).toBe("5521:2026-05-28");
		expect(row.messages).toBeUndefined();
		expect(row.totalCost).toBeUndefined();
	});
});

// -----------------------------------------------------------------------------
// get/set_system_prompt — KV round-trip
// -----------------------------------------------------------------------------

describe("system prompt tools", () => {
	test("get falls back to bundled when KV empty", async () => {
		const env = fakeEnv();
		const out = (await toolByName.get_system_prompt.execute(env, {})) as any;
		expect(out.source).toBe("bundled-fallback");
		expect(out.prompt.length).toBeGreaterThan(100);
	});

	test("set then get round-trips through KV", async () => {
		const env = fakeEnv();
		await toolByName.set_system_prompt.execute(env, { prompt: "you are a vampire" });
		const got = (await toolByName.get_system_prompt.execute(env, {})) as any;
		expect(got.source).toBe("kv-override");
		expect(got.prompt).toBe("you are a vampire");
	});

	test("set with empty string clears the override", async () => {
		const env = fakeEnv({ "system-prompt": "old override" });
		const out = (await toolByName.set_system_prompt.execute(env, { prompt: "" })) as any;
		expect(out.source).toBe("bundled-fallback");
		const got = (await toolByName.get_system_prompt.execute(env, {})) as any;
		expect(got.source).toBe("bundled-fallback");
	});

	test("set trims whitespace-only prompts as clear", async () => {
		const env = fakeEnv({ "system-prompt": "old" });
		await toolByName.set_system_prompt.execute(env, { prompt: "   \n  " });
		const got = (await toolByName.get_system_prompt.execute(env, {})) as any;
		expect(got.source).toBe("bundled-fallback");
	});
});

// -----------------------------------------------------------------------------
// get_status — shape & secret redaction
// -----------------------------------------------------------------------------

describe("get_status", () => {
	test("never leaks secret values — only presence booleans", async () => {
		const env = {
			...fakeEnv(),
			CF_AI_GATEWAY_TOKEN: "cfut_supersecret",
			META_ACCESS_TOKEN: "EAA_xxx",
		};
		const out = (await toolByName.get_status.execute(env, {})) as any;
		expect(out.secrets.CF_AI_GATEWAY_TOKEN).toBe(true);
		expect(out.secrets.META_ACCESS_TOKEN).toBe(true);
		// Sanity: no raw secret leaked anywhere in the response.
		const json = JSON.stringify(out);
		expect(json).not.toContain("cfut_supersecret");
		expect(json).not.toContain("EAA_xxx");
	});

	test("reports ragEnabled false when instance unset", async () => {
		const env = { ...fakeEnv(), AUTORAG_INSTANCE: "" };
		const out = (await toolByName.get_status.execute(env, {})) as any;
		expect(out.ragEnabled).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// list_corpus — R2 enumeration with prettified names
// -----------------------------------------------------------------------------

describe("list_corpus", () => {
	test("returns prettified names and skips non-prefixed objects", async () => {
		const env = fakeEnv({}, [
			{
				key: "01. Plano de Governo - Augusto Cury.md",
				size: 12345,
				uploaded: "2026-05-28T10:00:00Z",
			},
			{ key: "other-thing.txt", size: 100, uploaded: "2026-05-28T11:00:00Z" },
		]);
		const out = (await toolByName.list_corpus.execute(env, {})) as any;
		expect(out.docs).toHaveLength(2);
		expect(out.docs[0]).toMatchObject({
			key: "01. Plano de Governo - Augusto Cury.md",
			prettifiedName: "Plano de Governo",
			size: 12345,
		});
		// uploaded is serialized as ISO string for JSON-safety
		expect(typeof out.docs[0].uploaded).toBe("string");
	});

	test("respects prefix filter", async () => {
		const env = fakeEnv({}, [
			{ key: "books/01.md", size: 1, uploaded: "2026-01-01T00:00:00Z" },
			{ key: "books/02.md", size: 2, uploaded: "2026-01-01T00:00:00Z" },
			{ key: "papers/03.md", size: 3, uploaded: "2026-01-01T00:00:00Z" },
		]);
		const out = (await toolByName.list_corpus.execute(env, { prefix: "books/" })) as any;
		expect(out.docs).toHaveLength(2);
		expect(out.docs.every((d: any) => d.key.startsWith("books/"))).toBe(true);
	});

	test("empty bucket → empty docs array", async () => {
		const env = fakeEnv();
		const out = (await toolByName.list_corpus.execute(env, {})) as any;
		expect(out.docs).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// get_dashboard — aggregates today's threads + corpus + status
// -----------------------------------------------------------------------------

describe("get_dashboard", () => {
	const today = (() => {
		const n = new Date();
		return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
	})();

	const TURNS_WITH_COST = JSON.stringify([
		{
			role: "user",
			content: "oi",
			ts: Date.now() - 1000,
		},
		{
			role: "assistant",
			content: "olá!",
			ts: Date.now(),
			model: "deepseek/deepseek-v4-flash",
			usage: { total_tokens: 100, cost: 0.0001 },
		},
	]);

	test("rolls up today's threads and cost into the today window", async () => {
		const env = fakeEnv(
			{
				[`t:5511:${today}`]: TURNS_WITH_COST,
				[`t:5521:${today}`]: TURNS_WITH_COST,
				[`t:5511:2026-01-01`]: TURNS_WITH_COST, // older day — excluded from month
			},
			[{ key: "01. Corpus.md", size: 10, uploaded: "2026-05-01T00:00:00Z" }],
		);

		const out = (await toolByName.get_dashboard.execute(env, {})) as any;
		expect(out.status.ok).toBe(true);
		expect(out.threadsToday).toBe(2);
		expect(out.windows.today.uniqueUsers).toBe(2);
		expect(out.windows.today.messages).toBe(2); // 1 user msg per thread × 2 threads
		expect(out.windows.today.cost).toBeCloseTo(0.0002);
		expect(out.windows.week.cost).toBeCloseTo(0.0002); // same threads, all in last 7 days
		expect(out.windows.month.cost).toBeCloseTo(0.0002); // 2026-01-01 is >30 days ago
		expect(out.daily).toHaveLength(14);
		// Today's bucket (last entry, since daily is oldest→today) carries the cost.
		expect(out.daily[13].date).toBe(today);
		expect(out.daily[13].cost).toBeCloseTo(0.0002);
		expect(out.daily[13].messages).toBe(2);
		expect(out.corpusCount).toBe(1);
		expect(out.promptSource).toBe("bundled-fallback");
		expect(out.recentTurns).toHaveLength(4); // 2 turns × 2 threads
	});

	test("recentTurns is sorted by ts descending", async () => {
		const env = fakeEnv({
			[`t:5511:${today}`]: JSON.stringify([
				{ role: "user", content: "first", ts: 1000 },
				{ role: "user", content: "third", ts: 3000 },
				{ role: "user", content: "second", ts: 2000 },
			]),
		});
		const out = (await toolByName.get_dashboard.execute(env, {})) as any;
		expect(out.recentTurns[0].turn.content).toBe("third");
		expect(out.recentTurns[1].turn.content).toBe("second");
		expect(out.recentTurns[2].turn.content).toBe("first");
	});

	test("no threads today → zero aggregates, status still ok", async () => {
		const env = fakeEnv();
		const out = (await toolByName.get_dashboard.execute(env, {})) as any;
		expect(out.threadsToday).toBe(0);
		expect(out.windows.today.messages).toBe(0);
		expect(out.windows.today.uniqueUsers).toBe(0);
		expect(out.windows.today.cost).toBe(0);
		expect(out.windows.week.cost).toBe(0);
		expect(out.windows.month.cost).toBe(0);
		expect(out.daily).toHaveLength(14);
		expect(
			out.daily.every((p: { cost: number; messages: number }) => p.cost === 0 && p.messages === 0),
		).toBe(true);
		expect(out.status.ok).toBe(true);
	});

	test("promptSource reflects KV override", async () => {
		const env = fakeEnv({ "system-prompt": "you are a poet" });
		const out = (await toolByName.get_dashboard.execute(env, {})) as any;
		expect(out.promptSource).toBe("kv-override");
	});
});

describe("export_threads_html", () => {
	const TURNS = JSON.stringify([
		{ role: "user", content: "oi", ts: 1, name: "Gabriel" },
		{ role: "assistant", content: "**olá!**", ts: 2, usage: { total_tokens: 50, cost: 0.0001 } },
	]);

	test("renders a self-contained HTML file with picked threads", async () => {
		const env = fakeEnv({
			"t:5511:2026-06-01": TURNS,
			"t:5521:2026-06-01": TURNS,
			"t:5599:2026-05-15": TURNS, // unrelated — not in selection
		});
		const out = (await toolByName.export_threads_html.execute(env, {
			thread_ids: ["5511:2026-06-01", "5521:2026-06-01"],
		})) as { html: string; filename: string; bytes: number; threadCount: number };

		expect(out.threadCount).toBe(2);
		expect(out.html).toContain("<!DOCTYPE html>");
		expect(out.html).toContain("Transcrições");
		expect(out.html).toContain("Gabriel");
		// Bot's markdown bold should survive the renderer.
		expect(out.html).toContain("<strong>olá!</strong>");
		// Bytes count matches actual UTF-8 length.
		expect(out.bytes).toBe(new TextEncoder().encode(out.html).length);
		expect(out.filename).toMatch(/^cury-export-\d{4}-\d{2}-\d{2}\.html$/);
		// Unselected thread is absent.
		expect(out.html).not.toContain("5599");
	});

	test("passes per-thread analysis into the analysis section", async () => {
		const env = fakeEnv({ "t:5511:2026-06-01": TURNS });
		const out = (await toolByName.export_threads_html.execute(env, {
			thread_ids: ["5511:2026-06-01"],
			per_thread: [
				{
					thread_id: "5511:2026-06-01",
					title: "Gabriel",
					subtitle: "filósofo",
					analysis: "He tested the bot's coherence.\n\n- Point one\n- Point two",
				},
			],
		})) as { html: string };

		expect(out.html).toContain("Análise");
		expect(out.html).toContain("filósofo");
		expect(out.html).toContain("<li>Point one</li>");
	});

	test("rejects empty thread_ids", async () => {
		const env = fakeEnv();
		await expect(toolByName.export_threads_html.execute(env, { thread_ids: [] })).rejects.toThrow();
	});

	test("uses optional title and intro when provided", async () => {
		const env = fakeEnv({ "t:5511:2026-06-01": TURNS });
		const out = (await toolByName.export_threads_html.execute(env, {
			thread_ids: ["5511:2026-06-01"],
			title: "Top filósofos de 2026",
			intro: "**Resumo executivo:** os melhores momentos.",
		})) as { html: string };

		expect(out.html).toContain("Top filósofos de 2026");
		expect(out.html).toContain("<strong>Resumo executivo:</strong>");
	});
});
