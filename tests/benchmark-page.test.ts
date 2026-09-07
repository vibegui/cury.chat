// A página /benchmark é montada uma vez, na inicialização do isolate, a partir
// de content/benchmark.json. Se o JSON perder um campo, o Worker inteiro morre
// ao subir — não só essa rota. Já aconteceu com um import de .css que chegou
// undefined e derrubou tudo.

import { describe, expect, test } from "bun:test";
import data from "../content/benchmark.json";
import { benchmarkRoute, IN_PRODUCTION } from "../api/routes/benchmark.ts";

const B = data as unknown as {
	ranAt: string;
	judge: string;
	baseline: { key: string; id: string; score: number; n: number }[];
	sweep: { key: string; id: string; score: number; n: number }[];
	frontier: string[];
	recommended: string | null;
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

	test("lista todas as configurações avaliadas", async () => {
		const html = await render();
		for (const r of [...B.baseline, ...B.sweep].filter((r) => r.n > 0)) {
			expect(html).toContain(r.id);
		}
	});

	/**
	 * O trava-página. A prosa diz "este site responde com X"; se alguém trocar
	 * LLM_MODEL e não regerar a página, ela passa a mentir para o visitante
	 * sobre o que está no ar — e essa é exatamente a promessa que ela faz.
	 */
	test("o modelo anunciado é o que o worker realmente usa", async () => {
		const wrangler = await Bun.file(`${import.meta.dir}/../wrangler.toml`).text();
		const configured = wrangler.match(/^LLM_MODEL\s*=\s*"([^"]+)"/m)?.[1];
		expect(configured).toBe(IN_PRODUCTION);
		expect(B.recommended).toBe(`${IN_PRODUCTION}#t4096`);

		const html = await render();
		expect(html).toContain("em produção");
	});

	test("declara a data e o juiz", async () => {
		const html = await render();
		expect(html).toContain(B.ranAt);
		expect(html).toContain(B.judge);
	});

	test("a fronteira de Pareto não contém ponto dominado", () => {
		const all = [...B.baseline, ...B.sweep].filter((r) => r.n > 0) as unknown as {
			key: string;
			score: number;
			costPerTurn: number;
			empties: number;
			errors: number;
		}[];
		const front = all.filter((r) => B.frontier.includes(r.key));
		expect(front.length).toBeGreaterThan(0);
		for (const p of front) {
			const dominator = all.find(
				(q) =>
					q.key !== p.key &&
					q.empties === 0 &&
					q.errors === 0 &&
					q.score >= p.score &&
					q.costPerTurn <= p.costPerTurn &&
					(q.score > p.score || q.costPerTurn < p.costPerTurn),
			);
			expect(dominator).toBeUndefined();
		}
	});
});
