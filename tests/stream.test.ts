import { afterEach, describe, expect, test } from "bun:test";
import { chatStream } from "../api/ai/gateway.ts";
import type { Env } from "../api/env.ts";

const env = {
	LLM_PROVIDER: "openrouter",
	LLM_MODEL: "test/model",
	AI_GATEWAY_ACCOUNT_ID: "acct",
	AI_GATEWAY_NAME: "gw",
} as unknown as Env;

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Serves `chunks` as the response body, exactly as split — that is the point. */
function mockStream(chunks: string[], ok = true, status = 200) {
	globalThis.fetch = (async () =>
		new Response(
			ok
				? new ReadableStream<Uint8Array>({
						start(controller) {
							const enc = new TextEncoder();
							for (const c of chunks) controller.enqueue(enc.encode(c));
							controller.close();
						},
					})
				: "upstream exploded",
			{ status },
		)) as unknown as typeof fetch;
}

function sse(obj: unknown): string {
	return `data: ${JSON.stringify(obj)}\n\n`;
}

const delta = (content: string) => sse({ choices: [{ delta: { content } }] });

async function collect(chunks: string[]) {
	const deltas: string[] = [];
	let done: { text: string; model: string; usage?: unknown } | undefined;
	mockStream(chunks);
	for await (const e of chatStream(env, [{ role: "user", content: "oi" }])) {
		if (e.type === "delta") deltas.push(e.text);
		else done = e;
	}
	return { deltas, done };
}

describe("chatStream", () => {
	test("yields each delta then a done event with the assembled text", async () => {
		const { deltas, done } = await collect([
			delta("Olá"),
			delta(", "),
			delta("mundo"),
			"data: [DONE]\n\n",
		]);
		expect(deltas).toEqual(["Olá", ", ", "mundo"]);
		expect(done?.text).toBe("Olá, mundo");
	});

	test("reassembles a record split across network chunks", async () => {
		// The real failure mode: a TCP chunk ends mid-JSON. A reader that parses
		// per chunk drops this delta and silently truncates the answer.
		const record = delta("inteligência multifocal");
		const cut = Math.floor(record.length / 2);
		const { deltas } = await collect([record.slice(0, cut), record.slice(cut)]);
		expect(deltas).toEqual(["inteligência multifocal"]);
	});

	test("reassembles a record split mid-multibyte-character", async () => {
		// "ç" is two bytes in UTF-8. TextDecoderStream must hold the partial
		// sequence rather than emit a replacement character.
		const record = delta("educação");
		const bytes = new TextEncoder().encode(record);
		const dec = new TextDecoder();
		const head = dec.decode(bytes.slice(0, 30), { stream: true });
		const tail = dec.decode(bytes.slice(30));
		const { deltas } = await collect([head, tail]);
		expect(deltas.join("")).toBe("educação");
	});

	test("ignores keep-alive comments and blank lines", async () => {
		const { deltas, done } = await collect([
			": ping\n\n",
			delta("a"),
			"\n\n",
			": ping\n\n",
			delta("b"),
		]);
		expect(deltas).toEqual(["a", "b"]);
		expect(done?.text).toBe("ab");
	});

	test("skips a malformed record instead of killing a live answer", async () => {
		const { deltas, done } = await collect([delta("bom"), "data: {nope\n\n", delta(" dia")]);
		expect(deltas).toEqual(["bom", " dia"]);
		expect(done?.text).toBe("bom dia");
	});

	test("carries usage and model from the final chunk", async () => {
		// Without stream_options.include_usage this arrives empty and the turn is
		// stored with no cost — the reason the request asks for it.
		const { done } = await collect([
			delta("oi"),
			sse({ choices: [], model: "deepseek/deepseek-v4-flash", usage: { total_tokens: 12278 } }),
			"data: [DONE]\n\n",
		]);
		expect(done?.model).toBe("deepseek/deepseek-v4-flash");
		expect(done?.usage).toEqual({ total_tokens: 12278 });
	});

	test("throws on a non-2xx upstream rather than yielding an empty answer", async () => {
		mockStream([], false, 502);
		const run = async () => {
			for await (const _ of chatStream(env, [{ role: "user", content: "oi" }])) {
				// drain
			}
		};
		expect(run()).rejects.toThrow(/openrouter via gateway: 502/);
	});
});

describe("conclusão vazia", () => {
	test("stream sem nenhum delta vira erro, não resposta em branco", async () => {
		// O modo de falha visto em produção: o modelo gasta a saída inteira em
		// reasoning_tokens e devolve content vazio. Antes disso virar erro, o
		// turno era gravado em branco e a pessoa não recebia nada.
		mockStream([
			sse({ choices: [], model: "deepseek/deepseek-v4-flash", usage: { completion_tokens: 141 } }),
			"data: [DONE]\n\n",
		]);
		const run = async () => {
			for await (const _ of chatStream(env, [{ role: "user", content: "Ola" }])) {
				// drena
			}
		};
		expect(run()).rejects.toThrow(/vazio/);
	});
});
