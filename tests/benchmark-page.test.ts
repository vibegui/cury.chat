// A página /benchmark é montada uma vez, na inicialização do isolate, a partir
// de content/benchmark.json. Se o JSON perder um campo, o Worker inteiro morre
// ao subir — não só essa rota. Já aconteceu com um import de .css que chegou
// undefined e derrubou tudo. Este teste é o alarme para essa classe de falha.

import { describe, expect, test } from "bun:test";
import data from "../content/benchmark.json";
import { benchmarkRoute } from "../api/routes/benchmark.ts";

const B = data as unknown as {
	ranAt: string;
	judge: string;
	results: { id: string; label: string; score: number; costPerTurn: number }[];
	reasoning: { id: string; arm?: string }[];
	questions: unknown[];
};

async function render(): Promise<string> {
	const res = await benchmarkRoute.request("/benchmark");
	expect(res.status).toBe(200);
	return res.text();
}

describe("página /benchmark", () => {
	test("renderiza e serve HTML", async () => {
		const html = await render();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("Qual modelo responde melhor");
	});

	test("lista todos os modelos avaliados", async () => {
		const html = await render();
		for (const r of B.results) {
			expect(html).toContain(r.id);
		}
	});

	test("marca em produção o modelo que o worker realmente usa", async () => {
		const html = await render();
		// Se alguém trocar LLM_MODEL no wrangler.toml e esquecer da página, ela
		// passa a dizer que rodamos um modelo que não rodamos mais.
		const wrangler = await Bun.file(`${import.meta.dir}/../wrangler.toml`).text();
		const inProduction = wrangler.match(/^LLM_MODEL\s*=\s*"([^"]+)"/m)?.[1];
		expect(inProduction).toBeTruthy();
		expect(html).toContain(`>${inProduction}</span>`);
		expect(html).toContain("em produção");
	});

	test("o estudo de reasoning tem os dois braços de cada modelo", () => {
		const byModel = new Map<string, string[]>();
		for (const r of B.reasoning) {
			byModel.set(r.id, [...(byModel.get(r.id) ?? []), r.arm ?? ""]);
		}
		expect(byModel.size).toBeGreaterThan(0);
		for (const arms of byModel.values()) {
			expect(arms.sort()).toEqual(["com-reasoning", "sem-reasoning"]);
		}
	});

	test("declara a data e o juiz", async () => {
		const html = await render();
		expect(html).toContain(B.ranAt);
		expect(html).toContain(B.judge);
	});
});
